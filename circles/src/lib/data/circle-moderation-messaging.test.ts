import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { ObjectId } from "mongodb";
import {
    sendCircleModerationMessage,
    type ModerationMessagingDependencies,
    type ModerationMessagingInput,
} from "./circle-moderation-messaging";
import { retryCircleModerationDelivery, sendCircleModerationMessageBestEffort } from "./circle-lifecycle";
import { createThread } from "./mongo-chat";

const circleId = new ObjectId().toString();
const lifecycleEventId = new ObjectId().toString();
const changedAt = new Date("2026-10-13T10:15:00.000Z");

function input(
    status: ModerationMessagingInput["status"],
    previousStatus: ModerationMessagingInput["previousStatus"] = "active",
    eventId = lifecycleEventId,
): ModerationMessagingInput {
    return {
        lifecycleEventId: eventId,
        circleId,
        circleName: "Quiet Circle",
        actorDid: "did:example:superadmin",
        previousStatus,
        status,
        reason: "Required moderation review",
        changedAt,
    };
}

function harness(adminDids: string[] = ["did:example:admin"]): {
    dependencies: ModerationMessagingDependencies;
    conversations: any[];
    memberships: Map<string, any>;
    topics: any[];
    notifications: any[];
} {
    const conversations: any[] = [];
    const memberships = new Map<string, any>();
    const topics: any[] = [];
    const notifications: any[] = [];
    let reservedConversationId: ObjectId | undefined;
    const dependencies: ModerationMessagingDependencies = {
        findAdminDids: async () => adminDids,
        findConversation: async (handle) => conversations.find((conversation) => conversation.handle === handle) || null,
        reserveConversationId: async (_circleId, candidateId) => {
            reservedConversationId ||= candidateId;
            return reservedConversationId;
        },
        findModeratorDids: async (_conversationId, participantDids) =>
            participantDids.filter((did) => memberships.get(did)?.role === "admin"),
        createConversation: async (conversation) => {
            const created = { ...conversation };
            conversations.push(created);
            return created;
        },
        updateConversation: async (conversationId, participants) => {
            const conversation = conversations.find((item) => item._id.equals(conversationId));
            conversation.participants = participants;
            conversation.archived = false;
            conversation.metadata = { source: "circle_moderation", version: "v1" };
            delete conversation.circleId;
        },
        activateMember: async (conversationId, userDid, role, joinedAt) => {
            memberships.set(userDid, { conversationId, userDid, role, joinedAt, status: "active" });
        },
        removeFormerMembers: async (_conversationId, currentDids) => {
            for (const did of memberships.keys()) if (!currentDids.includes(did)) memberships.delete(did);
        },
        createThread: async (conversationId, senderDid, title, body, hashtags, metadata, messageId) => {
            const existing = topics.find((item) => item._id === messageId);
            if (existing) return existing;
            const topic = { _id: messageId || new ObjectId().toString(), conversationId, senderDid, title, body, hashtags, ...metadata };
            topics.push(topic);
            return topic as any;
        },
        sendNotifications: async (type, recipients, payload, options) => {
            const key = `${options?.idempotencyKey}:${recipients[0]?.did}`;
            if (!notifications.some((item) => item.key === key)) notifications.push({ type, recipients, payload, key });
        },
    };
    return { dependencies, conversations, memberships, topics, notifications };
}

test("creates one correctly titled topic starter with complete lifecycle details", async () => {
    for (const [previousStatus, status, title] of [
        ["active", "paused", "Circle paused"],
        ["active", "suspended", "Circle suspended"],
        ["active", "removed", "Circle removed"],
        ["suspended", "active", "Circle reactivated"],
    ] as const) {
        const state = harness();
        await sendCircleModerationMessage(input(status, previousStatus), state.dependencies);
        assert.equal(state.topics.length, 1);
        assert.equal(state.topics[0].title, title);
        assert.equal(state.topics[0].senderDid, "did:example:superadmin");
        assert.deepEqual(state.topics[0].hashtags, []);
        assert.match(state.topics[0].body, /Circle: Quiet Circle/);
        assert.match(state.topics[0].body, new RegExp(`Status: ${previousStatus} → ${status}`));
        assert.match(state.topics[0].body, /Reason: Required moderation review/);
        assert.match(state.topics[0].body, /Changed at: 2026-10-13T10:15:00.000Z/);
        assert.equal(state.notifications.length, 1);
        assert.equal(state.notifications[0].type, "circle_moderation_update");
        assert.equal(state.topics[0].source, "circle_moderation");
        assert.equal(state.topics[0].version, "v1");
    }
});

test("reuses one standalone conversation and never sets circleId", async () => {
    const state = harness();
    const first = await sendCircleModerationMessage(input("paused"), state.dependencies);
    const second = await sendCircleModerationMessage(input("active", "paused", new ObjectId().toString()), state.dependencies);
    assert.equal(first.conversationId, second.conversationId);
    assert.equal(state.conversations.length, 1);
    assert.equal(state.conversations[0].handle, `circle-moderation-${circleId}`);
    assert.notEqual(state.conversations[0]._id.toString(), circleId);
    assert.equal("circleId" in state.conversations[0], false);
    assert.deepEqual(state.conversations[0].metadata, { source: "circle_moderation", version: "v1" });
    assert.equal(state.topics.length, 2);
    assert.notEqual(state.topics[0]._id, state.topics[1]._id);
    assert.equal(state.topics[0].conversationId, first.conversationId);
    assert.equal(state.topics[1].conversationId, second.conversationId);
    assert.equal(state.notifications.length, 2);
});

test("a later acting superadmin retains the previous platform moderator", async () => {
    const state = harness([]);
    await sendCircleModerationMessage(
        { ...input("paused"), actorDid: "did:example:superadmin-a" },
        state.dependencies,
    );
    await sendCircleModerationMessage(
        { ...input("active", "paused", new ObjectId().toString()), actorDid: "did:example:superadmin-b" },
        state.dependencies,
    );

    assert.deepEqual(state.conversations[0].participants, [
        "did:example:superadmin-a",
        "did:example:superadmin-b",
    ]);
    assert.equal(state.memberships.get("did:example:superadmin-a").role, "admin");
    assert.equal(state.memberships.get("did:example:superadmin-b").role, "admin");
});

test("deduplicates current admins, activates them, and reconciles former admins out", async () => {
    const state = harness(["did:example:admin", "did:example:admin", "did:example:new-admin"]);
    state.conversations.push({
        _id: new ObjectId(),
        type: "group",
        handle: `circle-moderation-${circleId}`,
        participants: ["did:example:former-admin"],
    });
    state.memberships.set("did:example:former-admin", { status: "active", role: "member" });
    await sendCircleModerationMessage(input("paused"), state.dependencies);
    assert.deepEqual([...state.memberships.keys()].sort(), [
        "did:example:admin",
        "did:example:new-admin",
        "did:example:superadmin",
    ]);
    assert.deepEqual(state.conversations[0].participants, [
        "did:example:superadmin",
        "did:example:admin",
        "did:example:new-admin",
    ]);
    assert.deepEqual(state.notifications.map((item) => item.recipients[0]), [
        { did: "did:example:admin" },
        { did: "did:example:new-admin" },
    ]);
    const notification = state.notifications[0];
    assert.equal(notification.payload.roomId, state.conversations[0]._id.toString());
    assert.equal(notification.payload.topicId, state.topics[0]._id);
    assert.equal(notification.payload.url, `/chat/${notification.payload.roomId}?topic=${notification.payload.topicId}`);
    assert.equal(notification.payload.messageBody, "A Circle moderation update is ready for review.");
    assert.doesNotMatch(
        JSON.stringify(notification.payload),
        /Quiet Circle|Required moderation review|paused|superadmin|Moderator/,
    );
    assert.equal(state.notifications.some((item) => item.type === "pm_received"), false);
});

test("handles a Circle with no admins while retaining the acting superadmin", async () => {
    const state = harness([]);
    await sendCircleModerationMessage(input("suspended"), state.dependencies);
    assert.deepEqual(state.conversations[0].participants, ["did:example:superadmin"]);
    assert.deepEqual([...state.memberships.keys()], ["did:example:superadmin"]);
    assert.equal(state.notifications.length, 0);
    assert.equal(state.topics.length, 1);
});

test("a cleanup failure after revocation leaves former admins without active access", async () => {
    const state = harness(["did:example:current-admin"]);
    state.conversations.push({
        _id: new ObjectId(),
        type: "group",
        handle: `circle-moderation-${circleId}`,
        participants: ["did:example:former-admin"],
    });
    state.memberships.set("did:example:former-admin", { status: "active", role: "member" });
    const removeFormerMembers = state.dependencies.removeFormerMembers;
    state.dependencies.removeFormerMembers = async (...args) => {
        await removeFormerMembers(...args);
        throw new Error("cleanup acknowledgement unavailable");
    };

    await assert.rejects(sendCircleModerationMessage(input("paused"), state.dependencies), /cleanup acknowledgement/);
    assert.equal(state.memberships.has("did:example:former-admin"), false);
});

test("a later activation failure cannot restore a former admin membership", async () => {
    const state = harness(["did:example:current-admin"]);
    state.conversations.push({
        _id: new ObjectId(),
        type: "group",
        handle: `circle-moderation-${circleId}`,
        participants: ["did:example:former-admin"],
    });
    state.memberships.set("did:example:former-admin", { status: "active", role: "member" });
    state.dependencies.activateMember = async () => {
        throw new Error("membership activation unavailable");
    };

    await assert.rejects(sendCircleModerationMessage(input("paused"), state.dependencies), /membership activation/);
    assert.equal(state.memberships.has("did:example:former-admin"), false);
});

test("does not notify the actor when the acting superadmin is also a Circle admin", async () => {
    const state = harness(["did:example:superadmin", "did:example:admin"]);
    await sendCircleModerationMessage(input("paused"), state.dependencies);
    assert.deepEqual(state.notifications[0].recipients, [{ did: "did:example:admin" }]);
});

test("retry of one lifecycle event reuses its topic and bell notifications", async () => {
    const state = harness(["did:example:admin", "did:example:second-admin"]);
    const first = await sendCircleModerationMessage(input("paused"), state.dependencies);
    const retry = await sendCircleModerationMessage(input("paused"), state.dependencies);
    assert.equal(first.topicId, lifecycleEventId);
    assert.equal(retry.topicId, first.topicId);
    assert.equal(state.topics.length, 1);
    assert.equal(state.notifications.length, 2, "one bell per recipient, with none duplicated by retry");
});

test("partial notification failure retries missing bells without duplicating the topic or delivered bell", async () => {
    const state = harness(["did:example:admin", "did:example:second-admin"]);
    const sendNotifications = state.dependencies.sendNotifications;
    let failed = false;
    state.dependencies.sendNotifications = async (type, recipients, payload, options) => {
        if (!failed && recipients[0]?.did === "did:example:second-admin") {
            failed = true;
            throw new Error("bell unavailable");
        }
        return sendNotifications(type, recipients, payload, options);
    };
    await assert.rejects(sendCircleModerationMessage(input("paused"), state.dependencies), /bell unavailable/);
    assert.equal(state.topics.length, 1);
    assert.equal(state.notifications.length, 1);
    await sendCircleModerationMessage(input("paused"), state.dependencies);
    assert.equal(state.topics.length, 1);
    assert.equal(state.notifications.length, 2);
});

test("messaging failure is swallowed after lifecycle success", async () => {
    const originalError = console.error;
    const errors: unknown[][] = [];
    console.error = (...args: unknown[]) => errors.push(args);
    try {
        await sendCircleModerationMessageBestEffort(input("paused"), async () => {
            throw new Error("notification unavailable");
        });
    } finally {
        console.error = originalError;
    }
    assert.equal(errors.length, 1);
});

test("lifecycle invokes messaging only after the successful compare-and-set gate", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/lib/data/circle-lifecycle.ts"), "utf8");
    const failedTransition = source.indexOf('if (result.modifiedCount !== 1) throw new Error');
    const messaging = source.indexOf("await sendCircleModerationMessageBestEffort", failedTransition);
    assert.ok(failedTransition >= 0 && messaging > failedTransition);
    assert.match(source, /lifecycleEventId: String\(successfulAuditEvent\._id\)/);
});

test("uses canonical topic creation without loose-message or action-layer insertion", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/lib/data/circle-moderation-messaging.ts"), "utf8");
    assert.match(source, /import \{ createThread \} from "@\/lib\/data\/mongo-chat"/);
    assert.doesNotMatch(source, /createMessage|createThreadAction|sendThreadReplyAction/);
});

test("canonical topic retry validates the recovered document and still updates the conversation", async () => {
    const conversationId = new ObjectId().toString();
    const recovered = {
        _id: new ObjectId(lifecycleEventId),
        conversationId,
        lifecycleEventId,
        source: "circle_moderation",
        version: "v1",
        senderDid: "did:example:superadmin",
        thread: { title: "Circle paused" },
    };
    let recoveryQuery: any;
    let conversationUpdates = 0;
    const result = await createThread(
        conversationId,
        recovered.senderDid,
        recovered.thread.title,
        "body",
        [],
        { source: "circle_moderation", version: "v1", lifecycleEventId },
        lifecycleEventId,
        {
            insertThread: async () => {
                throw Object.assign(new Error("duplicate"), { code: 11000 });
            },
            findThread: async (query) => {
                recoveryQuery = query;
                return recovered;
            },
            updateConversation: async (updatedConversationId) => {
                assert.equal(updatedConversationId.toString(), conversationId);
                conversationUpdates += 1;
            },
        },
    );
    assert.equal(result?._id, lifecycleEventId);
    assert.equal(conversationUpdates, 1);
    assert.deepEqual(recoveryQuery, {
        _id: new ObjectId(lifecycleEventId),
        conversationId,
        lifecycleEventId,
        source: "circle_moderation",
        version: "v1",
        senderDid: recovered.senderDid,
        "thread.title": recovered.thread.title,
        thread: { $exists: true },
    });
});

test("retry validates lifecycle audit records before looking up a Circle or replaying delivery", async () => {
    const validEvent = {
        eventType: "circle.moderation_status_changed",
        targetType: "circle",
        targetId: circleId,
        actorDid: "did:example:superadmin",
        details: {
            previousStatus: "active",
            status: "paused",
            changedAt,
            reason: "Required moderation review",
        },
    };
    for (const [label, event] of [
        ["target ID", { ...validEvent, targetId: "malformed" }],
        ["actor DID", { ...validEvent, actorDid: "" }],
        ["previous status", { ...validEvent, details: { ...validEvent.details, previousStatus: "unknown" } }],
        ["status", { ...validEvent, details: { ...validEvent.details, status: "unknown" } }],
        ["transition", { ...validEvent, details: { ...validEvent.details, previousStatus: "removed", status: "active" } }],
        ["date", { ...validEvent, details: { ...validEvent.details, changedAt: new Date("invalid") } }],
        ["reason", { ...validEvent, details: { ...validEvent.details, reason: "" } }],
    ] as const) {
        let circleLookups = 0;
        let sends = 0;
        await assert.rejects(
            retryCircleModerationDelivery(lifecycleEventId, {
                findAuditEvent: async () => event,
                findCircle: async () => {
                    circleLookups += 1;
                    return { name: "Quiet Circle" };
                },
                sendMessage: async () => {
                    sends += 1;
                    return { conversationId: "unused", topicId: "unused" };
                },
            }),
            /./,
            label,
        );
        assert.equal(circleLookups, 0, `${label} must fail before Circle lookup`);
        assert.equal(sends, 0, `${label} must fail before replay`);
    }
});

test("retry confirms the target Circle still exists before replay", async () => {
    let sends = 0;
    await assert.rejects(
        retryCircleModerationDelivery(lifecycleEventId, {
            findAuditEvent: async () => ({
                eventType: "circle.moderation_status_changed",
                targetType: "circle",
                targetId: circleId,
                actorDid: "did:example:superadmin",
                details: { previousStatus: "active", status: "paused", changedAt, reason: "Required moderation review" },
            }),
            findCircle: async () => null,
            sendMessage: async () => {
                sends += 1;
                return { conversationId: "unused", topicId: "unused" };
            },
        }),
        /Circle not found/,
    );
    assert.equal(sends, 0);
});
