import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ToolKey } from "../../api/shared/tools";
import type { ToolSuggestionInput, ToolWorkflowInput } from "../../api/shared/tool-workflow";
import { apiHttpClient } from "./base";
import type { ImageGeneration } from "./types";

export type { ToolSuggestionInput, ToolWorkflowInput } from "../../api/shared/tool-workflow";

export type ToolGeneration = Omit<ImageGeneration, "toolKey"> & {
    toolKey: ToolKey;
    toolInput?: ToolWorkflowInput | null;
};

export function submitToolTask(input: ToolWorkflowInput) {
    return apiHttpClient.post<ToolGeneration>("/generations/tools/tasks", input);
}

export function useGenerateToolMutation() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: submitToolTask,
        onSettled: () => Promise.all([
            client.invalidateQueries({ queryKey: ["image-studio", "generations"] }),
            client.invalidateQueries({ queryKey: ["image-studio", "credit-balance"] }),
            client.invalidateQueries({ queryKey: ["image-studio", "credit-quote"] }),
        ]),
    });
}

export function useToolSuggestionsMutation() {
    return useMutation({
        mutationFn: (input: ToolSuggestionInput) => apiHttpClient.post<{ suggestions: string }>(
            "/generations/tools/suggest", input, { timeout: 120000 },
        ),
        retry: false,
    });
}