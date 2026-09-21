import { describe, expect, mock, test } from "bun:test";
import {
    getChatActionContext,
    getChatActionViewerDid,
    observeChatActionEffect,
    runWithChatActionContext,
} from "./chat-action-context";

describe("getChatActionContext", () => {
    test("is undefined outside of a chat action context", () => {
        expect(getChatActionContext()).toBeUndefined();
    });

    test("returns the context passed to runWithChatActionContext", async () => {
        const context = { viewerDid: "did:viewer" };

        await runWithChatActionContext(context, async () => {
            expect(getChatActionContext()).toBe(context);
        });
    });

    test("follows the context across await boundaries", async () => {
        const context = { viewerDid: "did:viewer" };

        await runWithChatActionContext(context, async () => {
            await Promise.resolve();
            await new Promise((resolve) => setTimeout(resolve, 1));
            expect(getChatActionContext()).toBe(context);
        });
    });

    test("does not leak the context once the callback has finished", async () => {
        await runWithChatActionContext({ viewerDid: "did:viewer" }, async () => {});

        expect(getChatActionContext()).toBeUndefined();
    });

    test("restores the outer context after a nested one ends", async () => {
        const outer = { viewerDid: "did:outer" };
        const inner = { viewerDid: "did:inner" };

        await runWithChatActionContext(outer, async () => {
            await runWithChatActionContext(inner, async () => {
                expect(getChatActionContext()).toBe(inner);
            });
            expect(getChatActionContext()).toBe(outer);
        });
    });

    test("keeps concurrent contexts isolated from each other", async () => {
        const seen: string[] = [];
        const run = (did: string, delay: number) =>
            runWithChatActionContext({ viewerDid: did }, async () => {
                await new Promise((resolve) => setTimeout(resolve, delay));
                seen.push(`${did}:${getChatActionContext()?.viewerDid}`);
            });

        await Promise.all([run("did:a", 10), run("did:b", 1)]);

        expect(seen.sort()).toEqual(["did:a:did:a", "did:b:did:b"]);
    });

    test("returns the callback's result", async () => {
        expect(await runWithChatActionContext({}, async () => 42)).toBe(42);
    });

    test("propagates errors thrown by the callback", async () => {
        await expect(
            runWithChatActionContext({}, async () => {
                throw new Error("boom");
            }),
        ).rejects.toThrow("boom");
        expect(getChatActionContext()).toBeUndefined();
    });
});

describe("observeChatActionEffect", () => {
    test("does nothing outside of a context", () => {
        expect(() => observeChatActionEffect("notification")).not.toThrow();
    });

    test("does nothing when the context has no observer", async () => {
        await runWithChatActionContext({}, async () => {
            expect(() => observeChatActionEffect("notification")).not.toThrow();
        });
    });

    test("reports each effect to the context's observer in order", async () => {
        const observeEffect = mock((_effect: string) => {});

        await runWithChatActionContext({ observeEffect }, async () => {
            observeChatActionEffect("message-persistence");
            observeChatActionEffect("notification");
        });

        expect(observeEffect.mock.calls.map(([effect]) => effect)).toEqual(["message-persistence", "notification"]);
    });

    test("only reaches the innermost context's observer", async () => {
        const outer = mock((_effect: string) => {});
        const inner = mock((_effect: string) => {});

        await runWithChatActionContext({ observeEffect: outer }, async () => {
            await runWithChatActionContext({ observeEffect: inner }, async () => {
                observeChatActionEffect("topic-create");
            });
        });

        expect(inner).toHaveBeenCalledWith("topic-create");
        expect(outer).not.toHaveBeenCalled();
    });
});

describe("getChatActionViewerDid", () => {
    const production = mock(async (): Promise<string | undefined> => "did:production");

    test("asks the production lookup when there is no context", async () => {
        production.mockClear();

        expect(await getChatActionViewerDid(production)).toBe("did:production");
        expect(production).toHaveBeenCalledTimes(1);
    });

    test("asks the production lookup when the context does not pin a viewer", async () => {
        production.mockClear();

        await runWithChatActionContext({}, async () => {
            expect(await getChatActionViewerDid(production)).toBe("did:production");
        });
        expect(production).toHaveBeenCalledTimes(1);
    });

    test("uses the viewer pinned by the context without asking production", async () => {
        production.mockClear();

        await runWithChatActionContext({ viewerDid: "did:pinned" }, async () => {
            expect(await getChatActionViewerDid(production)).toBe("did:pinned");
        });
        expect(production).not.toHaveBeenCalled();
    });

    test.each([null, undefined, ""])("treats a pinned viewer of %p as signed out without asking production", async (viewerDid) => {
        production.mockClear();

        await runWithChatActionContext({ viewerDid }, async () => {
            expect(await getChatActionViewerDid(production)).toBeUndefined();
        });
        expect(production).not.toHaveBeenCalled();
    });

    test("propagates errors from the production lookup", async () => {
        await expect(
            getChatActionViewerDid(async () => {
                throw new Error("no session");
            }),
        ).rejects.toThrow("no session");
    });
});
