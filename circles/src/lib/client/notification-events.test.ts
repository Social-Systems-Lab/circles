import assert from "node:assert/strict";
import {
    KAMOONI_NOTIFICATIONS_CHANGED_EVENT,
    addNotificationRefreshListener,
    dispatchNotificationRefresh,
    dispatchNotificationRefreshIfOk,
} from "./notification-events";

const target = new EventTarget();

(globalThis as any).window = {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
};

if (typeof (globalThis as any).CustomEvent === "undefined") {
    (globalThis as any).CustomEvent = class CustomEvent<T = unknown> extends Event {
        detail: T;

        constructor(type: string, init?: CustomEventInit<T>) {
            super(type);
            this.detail = init?.detail as T;
        }
    };
}

let calls = 0;
let latestRoomId: string | undefined;

const removeListener = addNotificationRefreshListener((event) => {
    calls += 1;
    latestRoomId = event.detail.roomId;
    assert.equal(event.type, KAMOONI_NOTIFICATIONS_CHANGED_EVENT);
});

dispatchNotificationRefresh({ reason: "notification-read", roomId: "room-1" });
assert.equal(calls, 1, "dispatch notifies mounted listeners");
assert.equal(latestRoomId, "room-1", "dispatch includes refresh detail");

removeListener();
dispatchNotificationRefresh({ reason: "notification-read", roomId: "room-2" });
assert.equal(calls, 1, "removed listeners are cleaned up");

const removeSuccessListener = addNotificationRefreshListener(() => {
    calls += 1;
});

assert.equal(
    dispatchNotificationRefreshIfOk({ ok: false }, { reason: "notification-read", roomId: "room-3" }),
    false,
    "failed responses do not dispatch refresh events",
);
assert.equal(calls, 1, "failed responses do not notify listeners");

assert.equal(
    dispatchNotificationRefreshIfOk({ ok: true }, { reason: "notification-read", roomId: "room-4" }),
    true,
    "successful responses dispatch refresh events",
);
assert.equal(calls, 2, "successful responses notify listeners");

removeSuccessListener();

console.log("notification-events tests passed");
