import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { ChatDraftRows, notifyDmDraftSaved } from "../../components/modules/chat/chat-draft-rows";
import { createChatRoomListRefresh, watchChatRoomList } from "./chat-room-list-refresh";
import { dispatchNotificationRefresh } from "./notification-events";

type Room = { _id: string; unreadCount: number };
type Result = { success: boolean; rooms?: Room[]; sessionChanged?: true };

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function setup(
    key = "active:did:alice",
    pendingLists = new Map<string, Promise<void>>(),
    options: { canRefresh?: () => boolean; onSessionChanged?: () => void } = {},
) {
    let now = 0;
    let running = 0;
    let maxRunning = 0;
    const loads: Array<ReturnType<typeof deferred<Result>> & { startedAt: number }> = [];
    const list = createChatRoomListRefresh({
        key,
        pendingLists,
        ...options,
        now: () => now,
        load: () => {
            running += 1;
            maxRunning = Math.max(maxRunning, running);
            const request = deferred<Result>();
            loads.push({ ...request, startedAt: now });
            return request.promise.finally(() => {
                running -= 1;
            });
        },
    });
    return {
        list,
        loads,
        time: (ms: number) => {
            now = ms;
        },
        maxRunning: () => maxRunning,
    };
}

const rooms = (...entries: Array<[string, number]>): Result => ({
    success: true,
    rooms: entries.map(([_id, unreadCount]) => ({ _id, unreadCount })),
});

test("three-second ticks and five-second responses publish throughout a simulated minute", async () => {
    const { list, loads, time, maxRunning } = setup();
    const deactivate = list.activate();
    let now = 0;
    let completed = 0;
    const publishedAt: number[] = [];
    const unsubscribe = list.subscribe(() => publishedAt.push(now));

    for (now = 0; now <= 60_000; now += 1_000) {
        time(now);
        if (now % 3_000 === 0) void list.refresh();
        const request = loads[completed];
        if (request && now === request.startedAt + 5_000) {
            completed += 1;
            request.resolve(rooms(["room", completed]));
        }
        await flush();
    }

    assert.equal(completed, 5);
    assert.equal(publishedAt.length, completed);
    assert.ok(publishedAt[0] - 5_000 <= 250);
    assert.deepEqual(publishedAt, [5_000, 17_000, 29_000, 41_000, 53_000]);
    assert.equal(list.getSnapshot().unreadCounts.room, completed);
    assert.equal(maxRunning(), 1);
    deactivate();
    unsubscribe();
    loads[completed].resolve(rooms());
    await flush();
});

test("initial failure settles the loading state and an immediate retry recovers", async () => {
    const { list, loads } = setup();
    const deactivate = list.activate();
    const first = list.refresh();
    await flush();
    loads[0].resolve({ success: false });
    await first;
    assert.equal(list.getSnapshot().status, "error");

    const retry = list.refresh("retry");
    await flush();
    loads[1].resolve(rooms(["room", 3]));
    await retry;
    assert.equal(list.getSnapshot().status, "ready");
    assert.equal(list.getSnapshot().unreadCounts.room, 3);
    deactivate();
});

test("a genuine invalidation arriving as a response publishes is still refreshed", async () => {
    const { list, loads } = setup();
    const deactivate = list.activate();
    const first = list.refresh();
    const unsubscribe = list.subscribe(() => {
        unsubscribe();
        queueMicrotask(() => void list.invalidate({ reason: "chat-sent", roomId: "room" }));
    });
    await flush();
    loads[0].resolve(rooms(["room", 1]));
    await first;
    await flush();

    assert.equal(loads.length, 2);
    loads[1].resolve(rooms(["room", 0]));
    await flush();
    assert.equal(list.getSnapshot().unreadCounts.room, 0);
    deactivate();
});

test("an older active list preserves a newer room count and the archived view stays separate", async () => {
    const pendingLists = new Map<string, Promise<void>>();
    const active = setup("active:did:alice", pendingLists);
    const archived = setup("archived:did:alice", pendingLists);
    const deactivateActive = active.list.activate();
    const deactivateArchive = archived.list.activate();
    const initial = active.list.refresh();
    await flush();
    active.loads[0].resolve(rooms(["room", 7], ["other", 2]));
    await initial;

    const stale = active.list.refresh("retry");
    const archive = archived.list.refresh();
    await flush();
    active.list.beginUnreadUpdate("room")(0);
    active.list.beginUnreadUpdate("archived-room")(99);
    archived.loads[0].resolve(rooms(["archived-room", 12]));
    active.loads[1].resolve(rooms(["room", 7], ["other", 3]));
    await Promise.all([stale, archive]);
    assert.deepEqual(active.list.getSnapshot().unreadCounts, { room: 0, other: 3 });
    assert.deepEqual(archived.list.getSnapshot().unreadCounts, { "archived-room": 12 });

    const lateRoomUpdate = active.list.beginUnreadUpdate("room");
    const fresh = active.list.refresh("retry");
    await flush();
    active.loads[2].resolve(rooms(["room", 2]));
    await fresh;
    lateRoomUpdate(0);
    assert.deepEqual(active.list.getSnapshot().unreadCounts, { room: 2 });

    const abandonedArchive = archived.list.refresh("retry");
    await flush();
    deactivateArchive();
    archived.loads[1].resolve(rooms(["archived-room", 17]));
    await abandonedArchive;
    assert.deepEqual(archived.list.getSnapshot().unreadCounts, { "archived-room": 12 });
    assert.deepEqual(active.list.getSnapshot().unreadCounts, { room: 2 });
    deactivateActive();
});

test("sustained reads and sends publish the list and reconcile unread after the last invalidation", async () => {
    const { list, loads, time, maxRunning } = setup();
    const deactivate = list.activate();
    void list.refresh();
    await flush();
    let count = 0;
    for (let now = 1_000; now <= 60_000; now += 1_000) {
        time(now);
        if (now % 3_000 === 0) {
            void list.invalidate({ reason: "chat-read", roomId: "open" });
            void list.invalidate({ reason: "chat-sent", roomId: "other" });
        }
        if (now % 5_000 === 0) {
            if (count === 0) list.beginUnreadUpdate("open")(0);
            loads[count++].resolve(rooms(["open", 8], ["other", count]));
            await flush();
            assert.equal(list.getSnapshot().status, "ready");
            assert.deepEqual(list.getSnapshot().unreadCounts, { open: 0, other: count });
        }
    }
    assert.equal(count, 12);
    assert.equal(loads.length, count + 1);
    loads[count].resolve(rooms(["open", 2], ["other", 13]));
    await flush();
    assert.deepEqual(list.getSnapshot().unreadCounts, { open: 2, other: 13 });
    assert.equal(maxRunning(), 1);
    deactivate();
});

test("membership changes omit affected stale rows and a revoked room stays absent after refresh", async () => {
    const { list, loads } = setup();
    const deactivate = list.activate();
    const first = list.refresh();
    await flush();
    void list.invalidate({ reason: "chat-rooms-changed", roomId: "archive" });
    loads[0].resolve(rooms(["secret", 8], ["archive", 4], ["other", 1]));
    await flush();
    assert.deepEqual(list.getSnapshot().unreadCounts, { secret: 8, other: 1 });
    assert.equal(list.getSnapshot().pendingRoomChanges, true);
    const oldSecretUnread = list.beginUnreadUpdate("secret");
    loads[1].resolve(rooms(["other", 2]));
    await first;
    oldSecretUnread(42);
    assert.deepEqual(
        list.getSnapshot().rooms.map((room) => room._id),
        ["other"],
    );
    assert.deepEqual(list.getSnapshot().unreadCounts, { other: 2 });
    assert.equal(list.getSnapshot().pendingRoomChanges, false);
    deactivate();
});

test("a server-reported session change clears a previously successful snapshot", async () => {
    let signedOut = false;
    const { list, loads } = setup("active:did:alice", new Map(), {
        onSessionChanged: () => {
            signedOut = true;
        },
    });
    const deactivate = list.activate();
    const first = list.refresh();
    await flush();
    loads[0].resolve(rooms(["private-room", 3]));
    await first;
    const retry = list.refresh("retry");
    await flush();
    loads[1].resolve({ success: false, sessionChanged: true });
    await retry;
    assert.deepEqual(list.getSnapshot(), { status: "error", rooms: [], unreadCounts: {} });
    assert.equal(signedOut, true);
    deactivate();
});

test("logout and account changes discard stale results and returning to a DID shares its in-flight lock", async () => {
    const pendingLists = new Map<string, Promise<void>>();
    const oldAlice = setup("active:did:alice", pendingLists);
    const deactivateOldAlice = oldAlice.list.activate();
    const oldRequest = oldAlice.list.refresh();
    await flush();
    deactivateOldAlice();

    const bob = setup("active:did:bob", pendingLists);
    const deactivateBob = bob.list.activate();
    const bobRequest = bob.list.refresh();
    await flush();
    bob.loads[0].resolve(rooms(["bob-room", 4]));
    await bobRequest;
    assert.deepEqual(bob.list.getSnapshot().unreadCounts, { "bob-room": 4 });
    deactivateBob();

    const newAlice = setup("active:did:alice", pendingLists);
    const deactivateNewAlice = newAlice.list.activate();
    const newRequest = newAlice.list.refresh();
    await flush();
    assert.equal(newAlice.loads.length, 0);
    oldAlice.loads[0].resolve(rooms(["alice-old-room", 8]));
    await oldRequest;
    await flush();
    assert.deepEqual(oldAlice.list.getSnapshot().unreadCounts, {});
    assert.deepEqual(newAlice.list.getSnapshot().unreadCounts, {});
    assert.equal(newAlice.loads.length, 1);
    newAlice.loads[0].resolve(rooms(["alice-current-room", 2]));
    await newRequest;
    assert.deepEqual(newAlice.list.getSnapshot().unreadCounts, { "alice-current-room": 2 });
    deactivateNewAlice();
});

function setupDom() {
    // jsdom is already installed by isomorphic-dompurify.
    const { JSDOM } = require("jsdom");
    const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
    const globals = {
        window: dom.window,
        document: dom.window.document,
        CustomEvent: dom.window.CustomEvent,
        IS_REACT_ACT_ENVIRONMENT: true,
    };
    const previous = Object.keys(globals).map(
        (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
    );
    Object.entries(globals).forEach(([name, value]) =>
        Object.defineProperty(globalThis, name, { configurable: true, value }),
    );
    return {
        dom,
        cleanup: () => {
            dom.window.close();
            for (const [name, descriptor] of previous) {
                if (descriptor) Object.defineProperty(globalThis, name, descriptor);
                else Reflect.deleteProperty(globalThis, name);
            }
        },
    };
}

test("focus and visibility coalesce while read and send events schedule one fresh request", async () => {
    const { dom, cleanup } = setupDom();
    const { list, loads, time, maxRunning } = setup();
    const stop = watchChatRoomList(list);
    const focusAndShow = () => {
        window.dispatchEvent(new dom.window.Event("focus"));
        document.dispatchEvent(new dom.window.Event("visibilitychange"));
    };
    try {
        await flush();
        focusAndShow();
        loads[0].resolve(rooms(["room", 6]));
        await flush();
        assert.equal(list.getSnapshot().unreadCounts.room, 6);
        assert.equal(loads.length, 1);

        time(10_000);
        focusAndShow();
        await flush();
        dispatchNotificationRefresh({ reason: "chat-read", roomId: "room" });
        dispatchNotificationRefresh({ reason: "chat-sent", roomId: "room" });
        focusAndShow();
        loads[1].resolve(rooms(["room", 9]));
        await flush();
        assert.equal(list.getSnapshot().unreadCounts.room, 6);
        assert.equal(loads.length, 3);

        loads[2].resolve(rooms(["room", 0]));
        await flush();
        dispatchNotificationRefresh({ reason: "notifications-opened" });
        focusAndShow();
        await flush();
        assert.equal(list.getSnapshot().unreadCounts.room, 0);
        assert.equal(loads.length, 3);
        assert.equal(maxRunning(), 1);
    } finally {
        stop();
        cleanup();
    }
});

test("hidden tabs defer follow-ups and visibility resumes immediately without a duplicate focus request", async () => {
    const { dom, cleanup } = setupDom();
    const { list, loads } = setup("active:did:alice", new Map(), {
        canRefresh: () => document.visibilityState === "visible",
    });
    const stop = watchChatRoomList(list);
    const setVisibility = (visibilityState: "visible" | "hidden") => {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: visibilityState });
        document.dispatchEvent(new dom.window.Event("visibilitychange"));
    };
    try {
        await flush();
        setVisibility("hidden");
        dispatchNotificationRefresh({ reason: "chat-read", roomId: "room" });
        loads[0].resolve(rooms(["room", 4]));
        await flush();
        await list.refresh("retry");
        assert.equal(loads.length, 1);

        setVisibility("visible");
        window.dispatchEvent(new dom.window.Event("focus"));
        await flush();
        assert.equal(loads.length, 2);
        loads[1].resolve(rooms(["room", 0]));
        await flush();
        assert.deepEqual(list.getSnapshot().unreadCounts, { room: 0 });
    } finally {
        stop();
        cleanup();
    }
});

test("the first room snapshot renders while drafts are pending and remains visible after draft failure", async () => {
    const { cleanup } = setupDom();
    const rootElement = document.querySelector("#root")!;
    const root = createRoot(rootElement);
    const { list, loads } = setup();
    const deactivate = list.activate();
    const draftResponse = deferred<{ success: false; drafts: [] }>();
    let draftCalls = 0;
    const loadDrafts = () => {
        draftCalls += 1;
        if (draftCalls === 1) return draftResponse.promise;
        return Promise.resolve({
            success: true,
            drafts: [{ recipientDid: "did:bob", name: "Bob", title: "Hello", updatedAt: "", picture: undefined }],
        });
    };

    function Messages() {
        const snapshot = useSyncExternalStore(list.subscribe, list.getSnapshot);
        return createElement(
            "main",
            {},
            createElement(ChatDraftRows, {
                viewerDid: "did:alice",
                ready: snapshot.status !== "loading",
                composerPath: null,
                loadDrafts,
                onOpen: () => {},
            }),
            ...snapshot.rooms.map((room) => createElement("p", { key: room._id }, room._id)),
        );
    }

    try {
        await act(async () => {
            root.render(createElement(Messages));
            void list.refresh();
            await flush();
        });
        assert.equal(draftCalls, 0);

        const completedAt = performance.now();
        await act(async () => {
            loads[0].resolve(rooms(["first conversation", 1]));
        });
        assert.match(rootElement.textContent ?? "", /first conversation/);
        assert.ok(performance.now() - completedAt <= 250);
        assert.equal(draftCalls, 1);

        await act(async () => {
            void list.refresh("retry");
            await flush();
            loads[1].resolve(rooms(["updated conversation", 2]));
        });
        assert.match(rootElement.textContent ?? "", /updated conversation/);
        assert.equal(draftCalls, 1);

        await act(async () => {
            draftResponse.resolve({ success: false, drafts: [] });
        });
        assert.match(rootElement.textContent ?? "", /updated conversation/);

        await act(async () => notifyDmDraftSaved());
        assert.match(rootElement.textContent ?? "", /Draft · Hello/);
        assert.equal(draftCalls, 2);
        assert.equal(loads.length, 2);
    } finally {
        deactivate();
        await act(async () => root.unmount());
        cleanup();
    }
});
