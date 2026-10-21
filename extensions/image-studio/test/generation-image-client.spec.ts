jest.mock("../src/web/services/base", () => ({
    apiHttpClient: { instance: { get: jest.fn() }, get: jest.fn(), post: jest.fn() },
}));
jest.mock("@tanstack/react-query", () => ({
    useQuery: jest.fn(), useMutation: jest.fn(), useQueryClient: jest.fn(),
}));

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiHttpClient } from "../src/web/services/base";
import {
    fetchGenerationImage, loadGenerationImage, isGenerationActive, useGenerationQuery,
    useGenerationHistoryQuery, useGenerateImageMutation, useRetryGenerationMutation,
    useCancelGenerationMutation,
} from "../src/web/services/generation";

describe("asynchronous generation client", () => {
    const invalidateQueries = jest.fn();
    const setQueryData = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (useQueryClient as jest.Mock).mockReturnValue({ invalidateQueries, setQueryData });
    });

    it.each(["queued", "processing", "completed", "failed", "cancelled"])("polls only active status %s", (status) => {
        const active = status === "queued" || status === "processing";
        useGenerationQuery("task-id");
        const options = (useQuery as jest.Mock).mock.calls[0][0];
        expect(options.enabled).toBe(true);
        expect(options.refetchInterval({ state: { data: { status } } })).toBe(active ? 2000 : false);
        expect(isGenerationActive({ status } as never)).toBe(active);
        useGenerationHistoryQuery();
        const historyOptions = (useQuery as jest.Mock).mock.calls[1][0];
        expect(historyOptions.refetchInterval({ state: { data: { items: [{ status }] } } })).toBe(active ? 5000 : false);
    });

    it("disables detail polling without a selected task and uses its own query key", async () => {
        useGenerationQuery();
        expect((useQuery as jest.Mock).mock.calls[0][0].enabled).toBe(false);
        expect(isGenerationActive(null)).toBe(false);
        useGenerationQuery("task-id");
        const options = (useQuery as jest.Mock).mock.calls[1][0];
        expect(options.queryKey).toEqual(["image-studio", "generation", "task-id"]);
        await options.queryFn();
        expect(apiHttpClient.get).toHaveBeenCalledWith("/generations/task-id");
    });

    it.each([
        [useGenerateImageMutation, "/generations/tasks", { prompt: "product" }],
        [useRetryGenerationMutation, "/generations/task-id/retry-task", "task-id"],
    ] as const)("uses asynchronous submit and retry endpoints", async (hook, endpoint, input) => {
        hook();
        const options = (useMutation as jest.Mock).mock.calls[0][0];
        await options.mutationFn(input);
        expect(apiHttpClient.post).toHaveBeenCalledWith(...(typeof input === "string" ? [endpoint] : [endpoint, input]));
        options.onSettled();
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["image-studio", "generations"] });
    });

    it("updates the selected task immediately after cancellation and refreshes history", async () => {
        useCancelGenerationMutation();
        const options = (useMutation as jest.Mock).mock.calls[0][0];
        await options.mutationFn("task-id");
        expect(apiHttpClient.post).toHaveBeenCalledWith("/generations/task-id/cancel");
        const record = { id: "task-id", status: "cancelled" };
        options.onSuccess(record);
        options.onSettled();
        expect(setQueryData).toHaveBeenCalledWith(["image-studio", "generation", "task-id"], record);
        expect(invalidateQueries).toHaveBeenCalled();
    });
});

describe("authenticated generation image client", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const get = apiHttpClient.instance.get as jest.Mock;

    beforeEach(() => jest.clearAllMocks());

    it("uses the bearer-enabled raw instance without the JSON envelope parser or cookies", async () => {
        const blob = new Blob(["image"], { type: "image/png" });
        const controller = new AbortController();
        get.mockResolvedValue({ data: blob });
        await expect(fetchGenerationImage(id, 0, "/api/", controller.signal)).resolves.toBe(blob);
        expect(get).toHaveBeenCalledWith(`/image-studio/api/generations/${id}/images/0`, {
            responseType: "blob", signal: controller.signal, withCredentials: false,
        });
    });

    it.each([
        ["../secret", 0, "api"], [id, -1, "api"], [id, 4, "api"],
        [id, 0.5, "api"], [id, 0, "//external.test"], [id, 0, "../api"],
    ])("rejects noncanonical selectors before requesting", async (taskId, index, prefix) => {
        await expect(fetchGenerationImage(String(taskId), Number(index), String(prefix))).rejects.toThrow("图片加载失败");
        expect(get).not.toHaveBeenCalled();
    });

    it.each([
        new Blob(["<svg/>"], { type: "image/svg+xml" }),
        new Blob(["<html/>"], { type: "text/html" }),
        new Blob([], { type: "image/png" }),
        new Blob([new Uint8Array(20 * 1024 * 1024 + 1)], { type: "image/png" }),
        { code: 20000, data: "not a blob" },
    ])("rejects unexpected binary responses", async (data) => {
        get.mockResolvedValue({ data });
        await expect(fetchGenerationImage(id, 0)).rejects.toThrow("图片加载失败");
    });

    it("does not display upstream response details", async () => {
        get.mockRejectedValue(new Error("sk-secret upstream response"));
        await expect(fetchGenerationImage(id, 0)).rejects.toThrow(/^图片加载失败，请稍后重试$/);
    });

    it("releases the Blob URL and aborts on unmount", async () => {
        const blob = new Blob(["image"], { type: "image/png" });
        get.mockResolvedValue({ data: blob });
        const create = jest.spyOn(URL, "createObjectURL").mockReturnValue("blob:owned-image");
        const revoke = jest.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
        const onLoad = jest.fn();
        const onError = jest.fn();
        const dispose = loadGenerationImage(id, 0, "api", onLoad, onError);
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(onLoad).toHaveBeenCalledWith({ blob, url: "blob:owned-image" });
        const signal = get.mock.calls[0][1].signal as AbortSignal;
        dispose();
        dispose();
        expect(signal.aborted).toBe(true);
        expect(revoke).toHaveBeenCalledTimes(1);
        expect(revoke).toHaveBeenCalledWith("blob:owned-image");
        expect(onError).not.toHaveBeenCalled();
        create.mockRestore();
        revoke.mockRestore();
    });

    it("ignores a late response after cancellation without allocating a Blob URL", async () => {
        let resolveRequest!: (response: { data: Blob }) => void;
        get.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
        const create = jest.spyOn(URL, "createObjectURL");
        const onLoad = jest.fn();
        const onError = jest.fn();
        const dispose = loadGenerationImage(id, 0, "api", onLoad, onError);
        dispose();
        resolveRequest({ data: new Blob(["image"], { type: "image/png" }) });
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(create).not.toHaveBeenCalled();
        expect(onLoad).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
        create.mockRestore();
    });
});