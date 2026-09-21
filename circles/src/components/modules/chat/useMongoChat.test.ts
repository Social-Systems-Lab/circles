import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ChatMessage } from "@/models/models";
import { silenceConsole } from "@/test/hooks";

type Result = { success: boolean; messages?: ChatMessage[]; nextSinceId?: string };

const fetchRecentMessagesAction = mock(async (_roomId: string, _limit: number): Promise<Result> => ({ success: true, messages: [] }));
const fetchMongoMessagesAction = mock(async (_roomId: string, _sinceId: string | undefined, _limit: number): Promise<Result> => ({ success: true, messages: [] }));
const markConversationReadAction = mock(async (_roomId: string, _topicId: null): Promise<{ success: boolean }> => ({ success: true }));
const dispatchNotificationRefresh = mock((_detail: unknown) => {});

mock.module("./actions", () => ({ fetchMongoMessagesAction, markConversationReadAction }));
mock.module("./mongo-actions", () => ({ fetchRecentMessagesAction }));
mock.module("@/lib/client/notification-events", () => ({ dispatchNotificationRefresh }));

const { useMongoChat } = await import("./useMongoChat");

const message = (id: string) => ({ id, content: `message ${id}` }) as unknown as ChatMessage;
type Rooms = Record<string, ChatMessage[]>;

// The hook polls with a 4000 ms setInterval; capture that callback so tests trigger polls explicitly.
// Every other interval (Testing Library's waitFor uses one) keeps running on the real timers.
const POLL_INTERVAL_MS = 4000;
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
let pollers: { callback: () => void | Promise<void>; delay: number; id: number; cleared: boolean }[];
let setIntervalSpy: ReturnType<typeof spyOn>;
let clearIntervalSpy: ReturnType<typeof spyOn>;
const consoleSpy = silenceConsole("error");

const setup = (options: { roomId?: string; enabled?: boolean; initial?: Rooms } = {}) => {
    let rooms: Rooms = options.initial ?? {};
    const setRoomMessages = mock((updater: Rooms | ((prev: Rooms) => Rooms)) => {
        rooms = typeof updater === "function" ? updater(rooms) : updater;
    });
    const rendered = renderHook(
        (props: { roomId?: string; enabled: boolean }) => useMongoChat({ ...props, setRoomMessages: setRoomMessages as never }),
        { initialProps: { roomId: "roomId" in options ? options.roomId : "room-1", enabled: options.enabled ?? true } },
    );
    return { ...rendered, setRoomMessages, rooms: () => rooms };
};
const poll = async () => {
    await act(async () => {
        await pollers[pollers.length - 1].callback();
    });
};
const loaded = async (hook: { result: { current: { isLoading: boolean } } }) => waitFor(() => expect(hook.result.current.isLoading).toBe(false));

beforeEach(() => {
    pollers = [];
    setIntervalSpy = spyOn(globalThis, "setInterval").mockImplementation(((callback: () => void, delay: number, ...rest: unknown[]) => {
        if (delay !== POLL_INTERVAL_MS) return realSetInterval(callback, delay, ...rest);
        const id = -(pollers.length + 1);
        pollers.push({ callback, delay, id, cleared: false });
        return id as never;
    }) as never);
    clearIntervalSpy = spyOn(globalThis, "clearInterval").mockImplementation(((id: number) => {
        const poller = pollers.find((entry) => entry.id === id);
        if (poller) poller.cleared = true;
        else realClearInterval(id);
    }) as never);
    for (const fn of [fetchRecentMessagesAction, fetchMongoMessagesAction, markConversationReadAction, dispatchNotificationRefresh]) fn.mockReset();
    fetchRecentMessagesAction.mockResolvedValue({ success: true, messages: [] });
    fetchMongoMessagesAction.mockResolvedValue({ success: true, messages: [] });
    markConversationReadAction.mockResolvedValue({ success: true });
});

afterEach(() => {
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
});

describe("useMongoChat", () => {
    describe("when there is nothing to load", () => {
        test("does nothing while disabled", async () => {
            const hook = setup({ enabled: false });

            expect(hook.result.current.isLoading).toBe(false);
            expect(fetchRecentMessagesAction).not.toHaveBeenCalled();
            expect(pollers).toHaveLength(0);
        });

        test("does nothing without a room", async () => {
            setup({ roomId: undefined });

            expect(fetchRecentMessagesAction).not.toHaveBeenCalled();
            expect(pollers).toHaveLength(0);
        });
    });

    describe("initial load", () => {
        test("fetches the 50 most recent messages for the room", async () => {
            const hook = setup();
            await loaded(hook);

            expect(fetchRecentMessagesAction).toHaveBeenCalledWith("room-1", 50);
        });

        test("reports loading until the messages have arrived", async () => {
            let release: (result: Result) => void = () => {};
            fetchRecentMessagesAction.mockReturnValue(new Promise((resolve) => (release = resolve)));

            const hook = setup();
            await waitFor(() => expect(hook.result.current.isLoading).toBe(true));

            await act(async () => release({ success: true, messages: [] }));
            await loaded(hook);
        });

        test("stores the messages under the room", async () => {
            fetchRecentMessagesAction.mockResolvedValue({ success: true, messages: [message("1"), message("2")] });

            const hook = setup();
            await loaded(hook);

            expect(hook.rooms()["room-1"].map((m) => m.id)).toEqual(["1", "2"]);
        });

        test("keeps messages already stored for the room and skips duplicates", async () => {
            fetchRecentMessagesAction.mockResolvedValue({ success: true, messages: [message("2"), message("3")] });

            const hook = setup({ initial: { "room-1": [message("1"), message("2")], "room-2": [message("x")] } });
            await loaded(hook);

            expect(hook.rooms()["room-1"].map((m) => m.id)).toEqual(["1", "2", "3"]);
            expect(hook.rooms()["room-2"].map((m) => m.id)).toEqual(["x"]);
        });

        test("does not touch the messages when there are none", async () => {
            const hook = setup();
            await loaded(hook);

            expect(hook.setRoomMessages).not.toHaveBeenCalled();
            expect(markConversationReadAction).not.toHaveBeenCalled();
        });

        test.each([
            ["a failed response", { success: false, messages: [message("1")] }],
            ["a response without messages", { success: true }],
        ])("ignores %s", async (_label, result) => {
            fetchRecentMessagesAction.mockResolvedValue(result);

            const hook = setup();
            await loaded(hook);

            expect(hook.setRoomMessages).not.toHaveBeenCalled();
        });

        test("marks the conversation read up to the latest message and refreshes notifications", async () => {
            fetchRecentMessagesAction.mockResolvedValue({ success: true, messages: [message("1"), message("2")] });

            const hook = setup();
            await loaded(hook);

            expect(markConversationReadAction).toHaveBeenCalledTimes(1);
            expect(markConversationReadAction).toHaveBeenCalledWith("room-1", null);
            expect(dispatchNotificationRefresh).toHaveBeenCalledWith({ reason: "chat-read", roomId: "room-1" });
        });

        test("does not refresh notifications when marking as read fails", async () => {
            fetchRecentMessagesAction.mockResolvedValue({ success: true, messages: [message("1")] });
            markConversationReadAction.mockResolvedValue({ success: false });

            const hook = setup();
            await loaded(hook);

            expect(dispatchNotificationRefresh).not.toHaveBeenCalled();
        });

        test("stops loading and logs when the fetch throws", async () => {
            fetchRecentMessagesAction.mockRejectedValue(new Error("network"));

            const hook = setup();
            await loaded(hook);

            expect(consoleSpy.error).toHaveBeenCalledWith("Failed to load recent messages:", expect.any(Error));
            expect(hook.setRoomMessages).not.toHaveBeenCalled();
        });

        test("starts a four second poll", async () => {
            const hook = setup();
            await loaded(hook);

            expect(pollers).toHaveLength(1);
            expect(pollers[0].delay).toBe(4000);
        });
    });

    describe("polling", () => {
        test("does not fetch before the initial load has finished", async () => {
            fetchRecentMessagesAction.mockReturnValue(new Promise(() => {}));
            setup();
            await waitFor(() => expect(pollers).toHaveLength(1));

            await poll();

            expect(fetchMongoMessagesAction).not.toHaveBeenCalled();
        });

        test("asks for messages after the latest one seen, 50 at a time", async () => {
            fetchRecentMessagesAction.mockResolvedValue({ success: true, messages: [message("1"), message("2")] });
            const hook = setup();
            await loaded(hook);

            await poll();

            expect(fetchMongoMessagesAction).toHaveBeenCalledWith("room-1", "2", 50);
        });

        test("asks for everything when the room was empty", async () => {
            const hook = setup();
            await loaded(hook);

            await poll();

            expect(fetchMongoMessagesAction).toHaveBeenCalledWith("room-1", undefined, 50);
        });

        test("appends new messages and skips ones already shown", async () => {
            fetchRecentMessagesAction.mockResolvedValue({ success: true, messages: [message("1")] });
            fetchMongoMessagesAction.mockResolvedValue({ success: true, messages: [message("1"), message("2")], nextSinceId: "2" });
            const hook = setup();
            await loaded(hook);

            await poll();

            expect(hook.rooms()["room-1"].map((m) => m.id)).toEqual(["1", "2"]);
        });

        test("continues from the cursor the server returned, falling back to the last message id", async () => {
            const hook = setup();
            await loaded(hook);
            fetchMongoMessagesAction.mockResolvedValueOnce({ success: true, messages: [message("5"), message("6")], nextSinceId: "cursor-6" });
            await poll();
            fetchMongoMessagesAction.mockResolvedValueOnce({ success: true, messages: [message("7")] });
            await poll();
            await poll();

            expect(fetchMongoMessagesAction.mock.calls.map((call) => call[1])).toEqual([undefined, "cursor-6", "7"]);
        });

        test("marks the conversation read when new messages arrive", async () => {
            const hook = setup();
            await loaded(hook);
            fetchMongoMessagesAction.mockResolvedValue({ success: true, messages: [message("1")], nextSinceId: "1" });

            await poll();

            expect(markConversationReadAction).toHaveBeenCalledWith("room-1", null);
            expect(dispatchNotificationRefresh).toHaveBeenCalledTimes(1);
        });

        test("does not mark the same position as read twice", async () => {
            const hook = setup();
            await loaded(hook);
            fetchMongoMessagesAction.mockResolvedValue({ success: true, messages: [message("1")], nextSinceId: "1" });

            await poll();
            await poll();

            expect(markConversationReadAction).toHaveBeenCalledTimes(1);
        });

        test("retries marking as read on the next poll when it failed", async () => {
            const hook = setup();
            await loaded(hook);
            fetchMongoMessagesAction.mockResolvedValue({ success: true, messages: [message("1")], nextSinceId: "1" });
            markConversationReadAction.mockResolvedValueOnce({ success: false });

            await poll();
            await poll();

            expect(markConversationReadAction).toHaveBeenCalledTimes(2);
            expect(dispatchNotificationRefresh).toHaveBeenCalledTimes(1);
        });

        test.each([
            ["a failed response", { success: false, messages: [message("1")] }],
            ["an empty response", { success: true, messages: [] }],
        ])("ignores %s", async (_label, result) => {
            const hook = setup();
            await loaded(hook);
            fetchMongoMessagesAction.mockResolvedValue(result);

            await poll();

            expect(hook.setRoomMessages).not.toHaveBeenCalled();
            expect(markConversationReadAction).not.toHaveBeenCalled();
        });

        test("logs a failed poll and keeps polling", async () => {
            const hook = setup();
            await loaded(hook);
            fetchMongoMessagesAction.mockRejectedValueOnce(new Error("network"));

            await poll();
            fetchMongoMessagesAction.mockResolvedValueOnce({ success: true, messages: [message("1")], nextSinceId: "1" });
            await poll();

            expect(consoleSpy.error).toHaveBeenCalledWith("Failed to poll mongo messages:", expect.any(Error));
            expect(hook.rooms()["room-1"].map((m) => m.id)).toEqual(["1"]);
        });
    });

    describe("lifecycle", () => {
        test("stops polling when unmounted", async () => {
            const hook = setup();
            await loaded(hook);

            hook.unmount();

            expect(pollers[0].cleared).toBe(true);
        });

        test("stops polling when disabled and does not restart until enabled again", async () => {
            const hook = setup();
            await loaded(hook);

            hook.rerender({ roomId: "room-1", enabled: false });

            expect(pollers[0].cleared).toBe(true);
            expect(pollers).toHaveLength(1);
        });

        test("starts over for a different room", async () => {
            fetchRecentMessagesAction.mockResolvedValue({ success: true, messages: [message("1")] });
            const hook = setup();
            await loaded(hook);

            fetchRecentMessagesAction.mockResolvedValue({ success: true, messages: [message("9")] });
            hook.rerender({ roomId: "room-2", enabled: true });
            await waitFor(() => expect(hook.rooms()["room-2"]?.map((m) => m.id)).toEqual(["9"]));

            expect(pollers[0].cleared).toBe(true);
            expect(pollers).toHaveLength(2);
            expect(fetchRecentMessagesAction).toHaveBeenLastCalledWith("room-2", 50);
            expect(hook.rooms()["room-1"].map((m) => m.id)).toEqual(["1"]);
        });

        test("polls the new room from its own cursor after switching", async () => {
            fetchRecentMessagesAction.mockResolvedValue({ success: true, messages: [message("1")] });
            const hook = setup();
            await loaded(hook);
            fetchRecentMessagesAction.mockResolvedValue({ success: true, messages: [message("9")] });
            hook.rerender({ roomId: "room-2", enabled: true });
            await waitFor(() => expect(pollers).toHaveLength(2));
            await waitFor(() => expect(fetchRecentMessagesAction).toHaveBeenCalledTimes(2));
            await act(async () => {});

            await poll();

            expect(fetchMongoMessagesAction).toHaveBeenCalledWith("room-2", "9", 50);
        });
    });
});
