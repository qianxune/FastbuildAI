import { quoteGenerationCredits } from "../src/api/shared/billing";
import { GenerationBillingService } from "../src/api/modules/generation/services/generation-billing.service";
import {
    ImageGeneration,
    ImageGenerationStatus,
} from "../src/api/db/entities/image-generation.entity";
import { User } from "@buildingai/db/entities";
import type { EntityManager } from "@buildingai/db/typeorm";
import { GenerationService } from "../src/api/modules/generation/services/generation.service";
import { generateImage } from "ai";
import { GENERATION_FAILED, GENERATION_STORAGE_RESTRICTED } from "../src/api/modules/generation/constants/generation.constants";

jest.mock("@buildingai/core/modules", () => ({ BaseBillingService: class {} }));
jest.mock("@buildingai/db/@nestjs/typeorm", () => ({ InjectRepository: () => () => undefined }));
jest.mock("ai", () => ({
    generateImage: jest.fn(() => {
        throw new Error("Image generation is forbidden in billing tests");
    }),
}));
jest.mock("../src/api/modules/generation/services/generation-model.service", () => ({
    GenerationModelService: class {},
}));
jest.mock("../src/api/modules/generation/services/generation-image.service", () => ({
    GenerationImageService: class {},
}));
jest.mock("../src/api/modules/generation/services/product-image.service", () => ({
    ProductImageService: class {},
}));
jest.mock("@buildingai/db/entities", () => ({ User: class {} }));
jest.mock("@buildingai/db/typeorm", () => ({ EntityManager: class {} }));
jest.mock("@buildingai/extension-sdk", () => ({ ExtensionBillingService: class {} }));
jest.mock("@buildingai/errors", () => ({
    HttpErrorFactory: {
        badRequest: (message: string) => new Error(message),
        notFound: (message: string) => new Error(message),
    },
}));
jest.mock("../src/api/db/entities/image-generation.entity", () => ({
    ImageGeneration: class {},
    ImageGenerationStatus: {
        QUEUED: "queued",
        PROCESSING: "processing",
        FAILED: "failed",
        CANCELLED: "cancelled",
        COMPLETED: "completed",
    },
}));

describe("image studio credit quotes", () => {
    it("uses the configured per-image price and requested count", () => {
        expect(quoteGenerationCredits({ power: 30 }, 3)).toEqual({
            unitPrice: 30,
            count: 3,
            total: 90,
        });
    });

    it("allows an explicitly configured free model", () => {
        expect(quoteGenerationCredits({ power: 0 }, 4).total).toBe(0);
    });
    it("prices ten SKU outputs only in the explicit SKU quote scope", () => {
        expect(quoteGenerationCredits({ power: 3 }, 10, "sku")).toEqual({ unitPrice: 3, count: 10, total: 30 });
        expect(() => quoteGenerationCredits({ power: 3 }, 10)).toThrow();
        expect(() => quoteGenerationCredits({ power: 3 }, 11, "sku")).toThrow();
        expect(() => quoteGenerationCredits({ power: 2147483647 }, 10, "sku")).toThrow();
    });

    it.each([undefined, null, { power: -1 }, { power: 0.5 }, { power: NaN }])(
        "rejects invalid pricing %p",
        (rule) => expect(() => quoteGenerationCredits(rule, 1)).toThrow(),
    );

    it.each([0, -1, 5, 1.5, NaN])("rejects invalid count %p", (count) => {
        expect(() => quoteGenerationCredits({ power: 1 }, count)).toThrow();
    });

    it("rejects overflowing totals", () => {
        expect(() => quoteGenerationCredits({ power: 2147483647 }, 4)).toThrow();
    });
});

describe("transactional image studio billing", () => {
    function fixture(initialBalance = 100) {
        let balance = initialBalance;
        let tasks: Record<string, ImageGeneration> = {};
        let nextTransaction = Promise.resolve();
        const repository = {
            manager: undefined as unknown as EntityManager,
            create: jest.fn((input) => ({ id: `task-${Object.keys(tasks).length + 1}`, ...input })),
            save: jest.fn(async (task) => {
                tasks[task.id] = structuredClone(task);
                return structuredClone(task);
            }),
            findOne: jest.fn(async ({ where }) => {
                const task = tasks[where.id];
                return task?.userId === where.userId ? structuredClone(task) : null;
            }),
        };
        const manager = {
            getRepository: jest.fn(() => repository),
            query: jest.fn(async () => []),
            findOneOrFail: jest.fn(async () => ({ id: "owner", power: balance })),
        } as unknown as EntityManager;
        repository.manager = manager;
        const deductUserPower = jest.fn(async ({ amount }, transaction) => {
            expect(transaction).toBe(manager);
            if (balance < amount) throw new Error("Insufficient credits");
            balance -= amount;
        });
        const addUserPower = jest.fn(async ({ amount }, transaction) => {
            expect(transaction).toBe(manager);
            balance += amount;
        });
        const getSpendablePower = jest.fn(async () => balance);
        const service = new GenerationBillingService(
            { deductUserPower, addUserPower } as unknown as ConstructorParameters<
                typeof GenerationBillingService
            >[0],
            { getSpendablePower } as unknown as ConstructorParameters<
                typeof GenerationBillingService
            >[1],
        );
        const transaction = <T>(work: () => Promise<T>): Promise<T> => {
            const operation = nextTransaction.then(async () => {
                const snapshot = { balance, tasks: structuredClone(tasks) };
                try {
                    return await work();
                } catch (error) {
                    balance = snapshot.balance;
                    tasks = snapshot.tasks;
                    throw error;
                }
            });
            nextTransaction = operation.then(
                () => undefined,
                () => undefined,
            );
            return operation;
        };
        const create = (power = 30, count = 2) =>
            transaction(() =>
                service.createTask(
                    manager,
                    {
                        userId: "owner",
                        count,
                        status: ImageGenerationStatus.QUEUED,
                    },
                    { power },
                ),
            );
        const fail = () =>
            transaction(() =>
                service.finishUnsuccessful(
                    manager,
                    "owner",
                    "task-1",
                    ImageGenerationStatus.FAILED,
                ),
            );
        const cancel = () =>
            transaction(() =>
                service.finishUnsuccessful(
                    manager,
                    "owner",
                    "task-1",
                    ImageGenerationStatus.CANCELLED,
                ),
            );
        return {
            service,
            manager,
            repository,
            transaction,
            create,
            fail,
            cancel,
            deductUserPower,
            addUserPower,
            balance: () => balance,
            task: () => tasks["task-1"],
        };
    }

    it("queries existing spendable balance without writing account credits", async () => {
        const state = fixture();
        expect(await state.service.balance("owner")).toEqual({ balance: 100 });
        expect(state.deductUserPower).not.toHaveBeenCalled();
        expect(state.addUserPower).not.toHaveBeenCalled();
    });
    it("charges ten validated SKU edits together and refunds the entire mocked task", async () => {
        const state = fixture();
        const modelId = "11111111-1111-4111-8111-111111111111";
        const assetId = "22222222-2222-4222-8222-222222222222";
        const toolInput = { tool: "sku" as const, modelId, assetIds: [assetId], instructions: "", count: 10, ratio: "1:1" as const,
            design: { skuRegions: [{ id: "region-1", region: { x: .1, y: .1, width: .2, height: .2 } }],
                skuVariants: Array.from({ length: 10 }, (_value, index) => ({ name: `SKU ${index + 1}`, instruction: "", edits: [{ regionId: "region-1", instruction: "Make green" }] })) } };
        await state.transaction(() => state.service.createTask(state.manager, { userId: "owner", count: 10, toolKey: "sku", toolInput, status: ImageGenerationStatus.QUEUED }, { power: 3 }));
        expect(state.balance()).toBe(70); expect(state.task()!.billingAmount).toBe(30);
        await state.fail(); expect(state.balance()).toBe(100);
        expect(state.addUserPower).toHaveBeenCalledTimes(1);
    });

    it.each([
        [GENERATION_STORAGE_RESTRICTED, GENERATION_STORAGE_RESTRICTED],
        ["private COS response and credentials", GENERATION_FAILED],
    ])("stores only an allowed failure reason and refunds once for %s", async (failure, expected) => {
        const state = fixture();
        await state.create();
        await state.transaction(() => state.service.finishUnsuccessful(state.manager, "owner", "task-1", ImageGenerationStatus.FAILED, failure));
        await state.fail();
        expect(state.task()).toMatchObject({ status: ImageGenerationStatus.FAILED, billingStatus: "refunded", images: [], error: expected });
        expect(state.addUserPower).toHaveBeenCalledTimes(1);
        expect(state.balance()).toBe(100);
        expect(generateImage).not.toHaveBeenCalled();
    });

    it("snapshots the price and uses the same transaction and task association for deduction", async () => {
        const state = fixture();
        const task = await state.create();
        expect(task).toMatchObject({ billingAmount: 60, billingStatus: "charged" });
        expect(state.balance()).toBe(40);
        expect(state.deductUserPower).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "owner",
                amount: 60,
                associationNo: task.id,
            }),
            state.manager,
        );
        expect(state.manager.getRepository).toHaveBeenCalledWith(ImageGeneration);
    });

    it("rolls back task creation when the existing billing service rejects insufficient balance", async () => {
        const state = fixture(20);
        await expect(state.create()).rejects.toThrow("Insufficient credits");
        expect(state.task()).toBeUndefined();
        expect(state.balance()).toBe(20);
    });

    it("does not create a task or deduct invalid prices", async () => {
        const state = fixture();
        await expect(state.create(-1)).rejects.toThrow();
        expect(state.repository.save).not.toHaveBeenCalled();
        expect(state.deductUserPower).not.toHaveBeenCalled();
    });

    it("refunds a failed task exactly once across repeated callbacks", async () => {
        const state = fixture();
        await state.create();
        await Promise.all([state.fail(), state.fail(), state.cancel()]);
        expect(state.balance()).toBe(100);
        expect(state.addUserPower).toHaveBeenCalledTimes(1);
        expect(state.task()).toMatchObject({
            status: "failed",
            billingStatus: "refunded",
            billingAmount: 60,
        });
        expect(state.repository.findOne).toHaveBeenCalledWith({
            where: { id: "task-1", userId: "owner" },
            lock: { mode: "pessimistic_write" },
        });
        expect(state.manager.findOneOrFail).toHaveBeenCalledWith(User, {
            where: { id: "owner" },
            lock: { mode: "pessimistic_write" },
        });
    });

    it("refunds cancellation and ignores a subsequent failure callback", async () => {
        const state = fixture();
        await state.create();
        await state.cancel();
        await state.fail();
        expect(state.addUserPower).toHaveBeenCalledTimes(1);
        expect(state.task()).toMatchObject({ status: "cancelled", billingStatus: "refunded" });
    });

    it("keeps the task charged and active if refunding fails, allowing a later retry", async () => {
        const state = fixture();
        await state.create();
        state.addUserPower.mockRejectedValueOnce(new Error("Ledger unavailable"));
        await expect(state.fail()).rejects.toThrow("Ledger unavailable");
        expect(state.task()).toMatchObject({ status: "queued", billingStatus: "charged" });
        expect(state.balance()).toBe(40);
        await state.fail();
        expect(state.balance()).toBe(100);
    });

    it.each(["uncharged", "free"] as const)(
        "never refunds a %s historical/free task",
        async (billingStatus) => {
            const state = fixture();
            await state.repository.save({
                id: "task-1",
                userId: "owner",
                status: "queued",
                billingStatus,
                billingAmount: 0,
            });
            await state.fail();
            expect(state.addUserPower).not.toHaveBeenCalled();
            expect(state.balance()).toBe(100);
        },
    );

    it("never calls the ledger for a free model", async () => {
        const state = fixture();
        await state.create(0);
        expect(state.task()).toMatchObject({ billingAmount: 0, billingStatus: "free" });
        expect(state.deductUserPower).not.toHaveBeenCalled();
    });

    it("keeps completed tasks charged even when a late failure/cancellation arrives", async () => {
        const state = fixture();
        const task = await state.create();
        await state.repository.save({ ...task, status: "completed" });
        await state.fail();
        await state.cancel();
        expect(state.addUserPower).not.toHaveBeenCalled();
        expect(state.balance()).toBe(40);
    });

    it("rejects attempts to refund another owner's task", async () => {
        const state = fixture();
        await state.create();
        await expect(
            state.transaction(() =>
                state.service.finishUnsuccessful(
                    state.manager,
                    "other-owner",
                    "task-1",
                    ImageGenerationStatus.FAILED,
                ),
            ),
        ).rejects.toThrow();
        expect(state.addUserPower).not.toHaveBeenCalled();
    });

    function orchestration(state: ReturnType<typeof fixture>) {
        const prepare = jest.fn(async () => ({
            model: { id: "model", name: "Image model", billingRule: { power: 30 } },
            imageModel: { supportsReferenceImages: true },
        }));
        const add = jest.fn(async () => ({}));
        const repository = {
            ...state.repository,
            manager: {
                transaction: <T>(work: (manager: EntityManager) => Promise<T>) =>
                    state.transaction(() => work(state.manager)),
            },
        };
        const service = new GenerationService(
            repository as unknown as ConstructorParameters<typeof GenerationService>[0],
            { prepare } as unknown as ConstructorParameters<typeof GenerationService>[1],
            {} as ConstructorParameters<typeof GenerationService>[2],
            { add } as unknown as ConstructorParameters<typeof GenerationService>[3],
            {
                read: jest.fn(async () => Buffer.from("fixture")),
            } as unknown as ConstructorParameters<typeof GenerationService>[4],
            state.service,
        );
        const input = {
            prompt: "Product image",
            modelId: "model",
            count: 2,
            size: "1024x1024",
            quality: "standard",
            style: "vivid",
        } as const;
        return { service, prepare, add, input };
    }

    afterEach(() => {
        expect(generateImage).not.toHaveBeenCalled();
    });

    it("charges queued creative submission without invoking inference", async () => {
        const state = fixture();
        const flow = orchestration(state);
        await expect(flow.service.submit("owner", flow.input)).resolves.toMatchObject({
            status: "queued",
            billingStatus: "charged",
            billingAmount: 60,
        });
        expect(state.balance()).toBe(40);
        expect(flow.add).toHaveBeenCalledTimes(1);
    });

    it("refunds submission when queue insertion fails", async () => {
        const state = fixture();
        const flow = orchestration(state);
        flow.add.mockRejectedValueOnce(new Error("Queue unavailable"));
        await expect(flow.service.submit("owner", flow.input)).rejects.toThrow();
        expect(state.balance()).toBe(100);
        expect(state.task()).toMatchObject({ status: "failed", billingStatus: "refunded" });
        expect(state.addUserPower).toHaveBeenCalledTimes(1);
    });

    it("rejects an unavailable model before any charge or queue insertion", async () => {
        const state = fixture();
        const flow = orchestration(state);
        flow.prepare.mockRejectedValueOnce(new Error("Model unavailable"));
        await expect(flow.service.submit("owner", flow.input)).rejects.toThrow();
        expect(state.deductUserPower).not.toHaveBeenCalled();
        expect(flow.add).not.toHaveBeenCalled();
    });

    it("also charges main-image tasks inside the existing product transaction", async () => {
        const state = fixture();
        const flow = orchestration(state);
        await expect(
            flow.service.submitMain("owner", {
                modelId: "model",
                assetIds: ["asset"],
                productName: "Product",
                brand: "",
                platform: "淘宝 / 天猫",
                language: "简体中文",
                ratio: "1:1",
                resolution: "2K",
                counts: { white: 1, scene: 1, selling: 0, other: 0 },
                instructions: "",
            } as Parameters<GenerationService["submitMain"]>[1]),
        ).resolves.toMatchObject({
            toolKey: "main",
            count: 2,
            billingAmount: 60,
            billingStatus: "charged",
        });
        expect(state.balance()).toBe(40);
        expect(flow.add).toHaveBeenCalledTimes(1);
    });

    it("blocks the legacy synchronous endpoint before inference when credits are insufficient", async () => {
        const state = fixture(0);
        const flow = orchestration(state);
        await expect(flow.service.generate("owner", flow.input)).rejects.toThrow(
            "Insufficient credits",
        );
        expect(state.task()).toBeUndefined();
        expect(state.balance()).toBe(0);
    });

    it("creates a newly charged task on retry without charging or refunding the original twice", async () => {
        const state = fixture();
        const flow = orchestration(state);
        await flow.service.submit("owner", flow.input);
        await state.fail();
        await expect(flow.service.retryTask("owner", "task-1")).resolves.toMatchObject({
            id: "task-2",
            billingStatus: "charged",
            billingAmount: 60,
        });
        expect(state.task()).toMatchObject({
            id: "task-1",
            status: "failed",
            billingStatus: "refunded",
        });
        expect(state.balance()).toBe(40);
        expect(state.deductUserPower).toHaveBeenCalledTimes(2);
        expect(state.addUserPower).toHaveBeenCalledTimes(1);
    });
});
