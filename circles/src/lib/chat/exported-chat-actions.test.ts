import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { runWithChatActionContext, type ChatActionContext } from "./chat-action-context";

// These exported-action tests replace every reached external effect. Avoid eagerly
// constructing the production Mongo client merely by importing the action modules.
process.env.IS_BUILD = "true";
const mongoActions: typeof import("@/components/modules/chat/mongo-actions") = require("@/components/modules/chat/mongo-actions");
const chatActions: typeof import("@/components/modules/chat/actions") = require("@/components/modules/chat/actions");

const alice = "did:alice";
const circleId = new ObjectId().toHexString();
const conversationId = new ObjectId().toHexString();
const messageId = new ObjectId().toHexString();
const topicId = new ObjectId().toHexString();
const conversation = {
    _id: new ObjectId(conversationId),
    type: "group",
    circleId,
    participants: [alice],
    name: "Leaked Secret name",
    description: "Leaked Secret description",
    updatedAt: new Date(),
};
const secretCircle = {
    _id: new ObjectId(circleId),
    circleType: "circle",
    visibility: "secret",
    moderationStatus: "active",
    name: "Secret Circle",
    handle: "secret-circle",
};

const staleContext = (effects: Record<string, number>): ChatActionContext => ({
    viewerDid: alice,
    findConversation: async () => conversation,
    findCircle: async () => secretCircle,
    findCanonicalMember: async () => null,
    findChatMember: async () => ({ userDid: alice, chatRoomId: conversationId, status: "active" }),
    findLegacyChatMember: async () => ({ userDid: alice, chatRoomId: conversationId, status: "active" }),
    findMessage: async () => ({ _id: new ObjectId(messageId), conversationId }),
    findLegacyChatRoom: async () => ({ _id: conversationId, circleId }),
    findMessagingUser: async () => ({
        did: alice,
        circleType: "user",
        picture: { url: "/alice.png" },
        description: "complete",
        isAdmin: true,
        isEmailVerified: true,
    }),
    findCanonicalMemberships: async () => [],
    findCandidates: async () => [conversation],
    findOwningCircles: async () => [secretCircle],
    findChatMemberships: async () => [{ userDid: alice, chatRoomId: conversationId, status: "active" }],
    mapConversations: async (_viewer, rooms) => {
        effects.hydration += rooms.length;
        return [];
    },
    getUnreadCounts: async (_viewer, ids) => {
        effects.unread += ids.length;
        return {};
    },
    saveFile: async () => {
        effects.storage = (effects.storage || 0) + 1;
        return {};
    },
});
const denied = (result: any, label: string) => {
    assert.equal(result?.success, false, label);
    assert.equal(result?.message, "Chat unavailable", label);
    for (const key of [
        "room",
        "messages",
        "threads",
        "replies",
        "media",
        "members",
        "memberCount",
        "counts",
        "isAdmin",
    ]) {
        assert.equal(result?.[key], undefined, `${label} exposes no ${key}`);
    }
};

const zeroEffectCounters = () => ({
    "message-persistence": 0,
    notification: 0,
    "system-message": 0,
    "membership-mutation": 0,
    "conversation-mutation": 0,
    "conversation-archive": 0,
    "conversation-read-state": 0,
    "topic-read-state": 0,
    "role-repair": 0,
    "storage-write": 0,
    "avatar-storage-write": 0,
    "conversation-ensure-create": 0,
    "topic-create": 0,
    "topic-update": 0,
    "topic-delete": 0,
    "reply-create": 0,
    "message-edit": 0,
    "message-delete": 0,
    "reaction-mutation": 0,
    "group-delete": 0,
    "group-leave": 0,
    "member-add": 0,
    "member-remove": 0,
    "member-promote": 0,
});

test("actual exported read actions deny a former Secret member with stale chat membership", async () => {
    const effects = { hydration: 0, unread: 0 };
    await runWithChatActionContext(staleContext(effects), async () => {
        denied(await mongoActions.fetchRecentMessagesAction(conversationId), "fetchRecentMessagesAction");
        denied(await mongoActions.fetchMongoMessagesAction(conversationId), "fetchMongoMessagesAction");
        denied(await mongoActions.fetchTopicStartersAction(conversationId), "fetchTopicStartersAction");
        denied(await mongoActions.fetchThreadRepliesAction(topicId, conversationId), "fetchThreadRepliesAction");
        denied(await mongoActions.getChatRoomAction(conversationId), "getChatRoomAction");
        const unread = await mongoActions.getUnreadCountsAction([conversationId]);
        assert.deepEqual(unread, { success: true, counts: {} });
        denied(await mongoActions.getTopicUnreadCountsAction(conversationId), "getTopicUnreadCountsAction");
        denied(await chatActions.listConversationMediaAction(conversationId), "listConversationMediaAction");
        denied(
            await chatActions.getActiveChatRoomMemberCountAction(conversationId),
            "getActiveChatRoomMemberCountAction",
        );
        denied(await chatActions.getChatRoomMembersAction(conversationId), "getChatRoomMembersAction");
        denied(await chatActions.canEditGroupInfoAction(conversationId), "canEditGroupInfoAction");
        const sidebar = await mongoActions.listChatRoomsAction();
        assert.deepEqual(sidebar, { success: true, rooms: [] });
    });
    assert.deepEqual(effects, { hydration: 0, unread: 0 }, "unauthorized sidebar candidates never reach enrichment");
});

test("authorized direct conversation loading hydrates one room without calculating sidebar unread counts", async () => {
    const effects = { hydration: 0, unread: 0 };
    const directConversation = {
        ...conversation,
        type: "dm",
        circleId: undefined,
        participants: [alice, "did:bob"],
    };
    await runWithChatActionContext(
        {
            ...staleContext(effects),
            findConversation: async () => directConversation,
            mapConversations: async (_viewer, rooms) => {
                effects.hydration += rooms.length;
                return rooms.map((room) => ({ _id: room._id.toString(), name: "Authorized room" })) as any;
            },
        },
        async () => {
            const result = await mongoActions.getChatRoomAction(conversationId);
            assert.equal(result.success, true);
            assert.equal(result.room?._id, conversationId);
        },
    );
    assert.deepEqual(effects, { hydration: 1, unread: 0 });
});

test("single-conversation loading preserves per-user active and archived DM visibility", async () => {
    const effects = { hydration: 0, unread: 0 };
    const archivedConversation = {
        ...conversation,
        type: "dm",
        circleId: undefined,
        participants: [alice, "did:bob"],
        archivedBy: [alice],
    };
    await runWithChatActionContext(
        {
            ...staleContext(effects),
            findConversation: async () => archivedConversation,
            mapConversations: async (_viewer, rooms) =>
                rooms.map((room) => ({ _id: room._id.toString(), name: "Archived room" })) as any,
        },
        async () => {
            denied(await mongoActions.getChatRoomAction(conversationId), "active archived DM");
            assert.equal((await mongoActions.getChatRoomAction(conversationId, "archived")).success, true);
        },
    );
});

test("actual exported write actions deny before mutation, upload, read state, repair or system events", async () => {
    const effects = { hydration: 0, unread: 0, storage: 0 };
    const effectCalls = zeroEffectCounters();
    const attachment = new FormData();
    attachment.set("roomId", conversationId);
    attachment.set("file", new File(["secret"], "secret.txt", { type: "text/plain" }));
    const avatar = new FormData();
    avatar.set("chatRoomId", conversationId);
    avatar.set("file", new File(["avatar"], "avatar.png", { type: "image/png" }));
    await runWithChatActionContext(
        {
            ...staleContext(effects),
            observeEffect: (effect) => {
                effectCalls[effect]++;
            },
        },
        async () => {
            denied(await mongoActions.sendMongoMessageAction(conversationId, "body"), "sendMongoMessageAction");
            denied(await mongoActions.sendThreadReplyAction(topicId, conversationId, "reply"), "sendThreadReplyAction");
            denied(await mongoActions.createThreadAction(conversationId, "topic", "body", []), "createThreadAction");
            denied(await mongoActions.updateTopicAction(conversationId, topicId, "topic", "body"), "updateTopicAction");
            denied(await mongoActions.deleteTopicAction(conversationId, topicId), "deleteTopicAction");
            denied(await mongoActions.editMongoMessageAction(messageId, "edited"), "editMongoMessageAction");
            denied(await mongoActions.deleteMongoMessageAction(messageId), "deleteMongoMessageAction");
            denied(await mongoActions.toggleMongoReactionAction(messageId, "👍"), "toggleMongoReactionAction");
            denied(
                await mongoActions.markConversationReadAction(conversationId, messageId),
                "markConversationReadAction",
            );
            denied(await mongoActions.markTopicReadAction(conversationId, topicId, messageId), "markTopicReadAction");
            denied(
                await chatActions.updateGroupInfoAction(conversationId, { name: "changed" }),
                "updateGroupInfoAction",
            );
            denied(await chatActions.updateGroupAvatarAction(avatar), "updateGroupAvatarAction");
            denied(await chatActions.addMembersAction(conversationId, ["did:bob"]), "addMembersAction");
            denied(await chatActions.removeMemberAction(conversationId, "did:bob"), "removeMemberAction");
            denied(await chatActions.promoteMemberAction(conversationId, "did:bob"), "promoteMemberAction");
            denied(await chatActions.deleteGroupChatAction(conversationId), "deleteGroupChatAction");
            denied(await chatActions.leaveGroupChatAction(conversationId), "leaveGroupChatAction");
            const contact = await mongoActions.contactCircleAdminsAction(circleId, "hello");
            assert.equal(contact.success, false, "contactCircleAdminsAction");
            assert.equal(contact.roomId, undefined, "contactCircleAdminsAction exposes no room");
            denied(await chatActions.joinChatRoomAction(conversationId), "joinChatRoomAction");
            denied(await chatActions.leaveChatRoomAction(conversationId), "leaveChatRoomAction");
            denied(
                await chatActions.sendGroupAnnouncementAction(conversationId, "announcement"),
                "sendGroupAnnouncementAction",
            );
            denied(await chatActions.sendReadReceiptAction(conversationId, messageId), "sendReadReceiptAction");
            denied(await mongoActions.sendMongoAttachmentAction(attachment), "sendMongoAttachmentAction");
            assert.equal((await chatActions.ensureCircleConversationAction(circleId)).success, false);
        },
    );
    assert.equal(effects.storage, 0);
    assert.deepEqual(effectCalls, zeroEffectCounters());
});

test("contact action denies Secret outsiders and stale former members with every production effect at zero", async () => {
    for (const canonicalMember of [null, undefined]) {
        const effects = { hydration: 0, unread: 0 };
        const effectCalls = zeroEffectCounters();
        await runWithChatActionContext(
            {
                ...staleContext(effects),
                findCanonicalMember: async () => canonicalMember,
                observeEffect: (effect) => {
                    effectCalls[effect]++;
                },
            },
            async () => {
                const result = await mongoActions.contactCircleAdminsAction(circleId, "hello");
                assert.equal(result.success, false);
                assert.equal(result.roomId, undefined);
            },
        );
        assert.deepEqual(effectCalls, zeroEffectCounters());
    }
});

test("join and legacy leave deny Secret outsiders and stale members before every production effect", async () => {
    for (const chatMember of [null, { userDid: alice, chatRoomId: conversationId, status: "active" }]) {
        const effects = { hydration: 0, unread: 0 };
        const effectCalls = zeroEffectCounters();
        await runWithChatActionContext(
            {
                ...staleContext(effects),
                findCanonicalMember: async () => null,
                findChatMember: async () => chatMember,
                authorizeFeature: async () => true,
                observeEffect: (effect) => {
                    effectCalls[effect]++;
                },
            },
            async () => {
                denied(await chatActions.joinChatRoomAction(conversationId), "denied legacy join");
                denied(await chatActions.leaveChatRoomAction(conversationId), "denied legacy leave");
            },
        );
        assert.deepEqual(effectCalls, zeroEffectCounters());
    }
});

test("announcement denies stale Secret admins before every production effect", async () => {
    const effects = { hydration: 0, unread: 0 };
    const effectCalls = zeroEffectCounters();
    await runWithChatActionContext(
        {
            ...staleContext(effects),
            listChatMembers: async () => [
                { userDid: alice, chatRoomId: conversationId, role: "admin", status: "active" },
            ],
            observeEffect: (effect) => {
                effectCalls[effect]++;
            },
        },
        async () => {
            denied(
                await chatActions.sendGroupAnnouncementAction(conversationId, "announcement"),
                "denied announcement",
            );
        },
    );
    assert.deepEqual(effectCalls, zeroEffectCounters());
});

test("authorized active Secret and public join, leave, contact and announcement behavior remains available", async () => {
    for (const visibility of ["secret", "public"] as const) {
        const effects = { hydration: 0, unread: 0, contact: 0, join: 0, leave: 0, announcement: 0 };
        await runWithChatActionContext(
            {
                ...staleContext(effects),
                findCircle: async () => ({ ...secretCircle, visibility }),
                findCanonicalMember: async () => (visibility === "secret" ? { userDid: alice, circleId } : null),
                authorizeFeature: async () => true,
                contactCircleAdminsEffect: async () => {
                    effects.contact++;
                    return { success: true, roomId: conversationId, created: true };
                },
                joinLegacyChatRoomEffect: async () => {
                    effects.join++;
                    return { success: true, chatRoomMember: { userDid: alice, chatRoomId: conversationId } };
                },
                leaveLegacyChatRoomEffect: async () => {
                    effects.leave++;
                    return { success: true, message: "Left chat room successfully" };
                },
                listChatMembers: async () => [
                    { userDid: alice, chatRoomId: conversationId, role: "admin", status: "active" },
                ],
                sendSystemMessageEffect: async () => {
                    effects.announcement++;
                    return { created: true, messageId };
                },
            },
            async () => {
                assert.equal((await mongoActions.contactCircleAdminsAction(circleId, "hello")).success, true);
                assert.equal((await chatActions.joinChatRoomAction(conversationId)).success, true);
                assert.equal((await chatActions.leaveChatRoomAction(conversationId)).success, true);
                assert.equal(
                    (await chatActions.sendGroupAnnouncementAction(conversationId, "announcement")).success,
                    true,
                );
            },
        );
        assert.deepEqual(effects, { hydration: 0, unread: 0, contact: 1, join: 1, leave: 1, announcement: 1 });
    }
});

test("missing and unauthorized resources have equivalent neutral exported-action results", async () => {
    const effects = { hydration: 0, unread: 0 };
    const invoke = async (missing: boolean) =>
        runWithChatActionContext(
            {
                ...staleContext(effects),
                findConversation: async () => (missing ? null : conversation),
                findMessage: async () => (missing ? null : { _id: new ObjectId(messageId), conversationId }),
            },
            async () => ({
                memberCount: await chatActions.getActiveChatRoomMemberCountAction(conversationId),
                members: await chatActions.getChatRoomMembersAction(conversationId),
                capability: await chatActions.canEditGroupInfoAction(conversationId),
                send: await mongoActions.sendMongoMessageAction(conversationId, "body"),
                reaction: await mongoActions.toggleMongoReactionAction(messageId, "👍"),
                readState: await mongoActions.markConversationReadAction(conversationId, messageId),
                settings: await chatActions.updateGroupInfoAction(conversationId, { name: "changed" }),
                membership: await chatActions.addMembersAction(conversationId, ["did:bob"]),
                readReceipt: await chatActions.sendReadReceiptAction(conversationId, messageId),
            }),
        );
    assert.deepEqual(await invoke(true), await invoke(false));
});

test("actual exported ensure/contact/join actions deny Secret outsider before side effects", async () => {
    const effects = { hydration: 0, unread: 0 };
    await runWithChatActionContext(staleContext(effects), async () => {
        const ensure = await chatActions.ensureCircleConversationAction(circleId);
        assert.equal(ensure.success, false);
        assert.equal(ensure.roomId, undefined);
        const contact = await mongoActions.contactCircleAdminsAction(circleId, "hello");
        assert.equal(contact.success, false);
        assert.equal(contact.roomId, undefined);
        const join = await chatActions.joinChatRoomAction(conversationId);
        assert.equal(join.success, false);
        assert.equal(join.chatRoomMember, undefined);
    });
});

test("actual exported ensure/contact/join actions preserve authorized Secret and public flows", async () => {
    for (const visibility of ["secret", "public"] as const) {
        const effects = { hydration: 0, unread: 0, ensure: 0, contact: 0, join: 0 };
        await runWithChatActionContext(
            {
                ...staleContext(effects),
                findCircle: async () => ({ ...secretCircle, visibility }),
                findCanonicalMember: async () => (visibility === "secret" ? { userDid: alice, circleId } : null),
                ensureCircleConversation: async () => {
                    effects.ensure++;
                    return { _id: conversationId };
                },
                contactCircleAdminsEffect: async () => {
                    effects.contact++;
                    return { success: true, roomId: conversationId, created: true };
                },
                authorizeFeature: async () => true,
                joinLegacyChatRoomEffect: async () => {
                    effects.join++;
                    return { success: true, chatRoomMember: { userDid: alice, chatRoomId: conversationId } };
                },
            },
            async () => {
                assert.equal((await chatActions.ensureCircleConversationAction(circleId)).success, true);
                assert.equal((await mongoActions.contactCircleAdminsAction(circleId, "hello")).success, true);
                assert.equal((await chatActions.joinChatRoomAction(conversationId)).success, true);
            },
        );
        assert.deepEqual(effects, { hydration: 0, unread: 0, ensure: 1, contact: 1, join: 1 });
    }
    let unauthenticatedEnsureEffects = 0;
    await runWithChatActionContext(
        {
            viewerDid: null,
            ensureCircleConversation: async () => {
                unauthenticatedEnsureEffects++;
            },
        },
        async () => {
            assert.equal((await chatActions.ensureCircleConversationAction(circleId)).success, false);
        },
    );
    assert.equal(unauthenticatedEnsureEffects, 0);
});

test("ensure action rejects missing, profile, malformed, and mismatched owners before creation", async () => {
    for (const owner of [
        null,
        { ...secretCircle, circleType: "user", visibility: "public" },
        { ...secretCircle, circleType: undefined, visibility: "public" },
        { ...secretCircle, _id: new ObjectId(), visibility: "public" },
    ]) {
        let ensureCalls = 0;
        await runWithChatActionContext(
            {
                viewerDid: alice,
                findCircle: async () => owner,
                findCanonicalMember: async () => ({ userDid: alice, circleId }),
                ensureCircleConversation: async () => {
                    ensureCalls++;
                    return { _id: conversationId };
                },
            },
            async () => {
                const result = await chatActions.ensureCircleConversationAction(circleId);
                assert.equal(result.success, false);
                assert.equal(result.roomId, undefined);
            },
        );
        assert.equal(ensureCalls, 0);
    }
});

test("actual exported read/write actions preserve DM, standalone group and public Circle access", async () => {
    const base = staleContext({ hydration: 0, unread: 0 });
    const cases = [
        {
            conversation: { _id: new ObjectId(), type: "dm", participants: [alice, "did:bob"] },
            circle: null,
            canonical: null,
        },
        { conversation: { _id: new ObjectId(), type: "group", participants: [alice] }, circle: null, canonical: null },
        {
            conversation: { ...conversation, circleId },
            circle: { ...secretCircle, visibility: "public" },
            canonical: null,
        },
    ];
    for (const item of cases) {
        let created = 0;
        await runWithChatActionContext(
            {
                ...base,
                findConversation: async () => item.conversation,
                findCircle: async () => item.circle,
                findCanonicalMember: async () => item.canonical,
                findChatMember: async () => ({ userDid: alice, chatRoomId: item.conversation._id, status: "active" }),
                fetchRecentMessages: async () => [],
                createMessage: async () => ({ _id: (++created).toString() }),
                notifyMessage: async () => undefined,
            },
            async () => {
                assert.deepEqual(await mongoActions.fetchRecentMessagesAction(item.conversation._id.toString()), {
                    success: true,
                    messages: [],
                    oldestId: undefined,
                });
                assert.equal(
                    (await mongoActions.sendMongoMessageAction(item.conversation._id.toString(), "hello")).success,
                    true,
                );
            },
        );
        assert.equal(created, 1);
    }
});

test("actual participant action separates paused reads from role-repair writes", async () => {
    for (const status of ["paused", "active"] as const) {
        let repairs = 0;
        const membershipId = new ObjectId();
        await runWithChatActionContext(
            {
                ...staleContext({ hydration: 0, unread: 0 }),
                findCircle: async () => ({ ...secretCircle, moderationStatus: status }),
                findCanonicalMember: async () => ({ userDid: alice, circleId }),
                listChatMembers: async () => [
                    {
                        _id: membershipId,
                        userDid: alice,
                        chatRoomId: conversationId,
                        joinedAt: new Date(),
                        status: "active",
                    },
                ],
                updateChatMemberRole: async (filter) => {
                    repairs++;
                    assert.deepEqual(filter, { _id: membershipId });
                    return { matchedCount: 1, modifiedCount: 1 };
                },
                findUserByDid: async () => ({
                    did: alice,
                    name: "Alice",
                    handle: "alice",
                    picture: { url: "/alice.png" },
                }),
            },
            async () => {
                const result = await chatActions.getChatRoomMembersAction(conversationId);
                assert.equal(result.success, true);
                assert.equal(result.members?.length, 1);
                assert.equal(result.members?.[0]?.role, status === "active" ? "admin" : "member");
            },
        );
        assert.equal(repairs, status === "active" ? 1 : 0);
    }
});

test("edit capability requires current write access and a persisted admin role", async () => {
    const invoke = async (status: "active" | "paused", members: any[], missing = false) =>
        runWithChatActionContext(
            {
                ...staleContext({ hydration: 0, unread: 0 }),
                findConversation: async () => (missing ? null : conversation),
                findCircle: async () => ({ ...secretCircle, moderationStatus: status }),
                findCanonicalMember: async () => ({ userDid: alice, circleId }),
                listChatMembers: async () => members,
            },
            () => chatActions.canEditGroupInfoAction(conversationId),
        );

    const persistedAdmin = [
        { userDid: alice, chatRoomId: conversationId, role: "admin", status: "active", joinedAt: new Date(0) },
    ];
    const ordinaryMember = [
        { userDid: alice, chatRoomId: conversationId, role: "member", status: "active", joinedAt: new Date(1) },
    ];
    const earliestMember = [
        { userDid: alice, chatRoomId: conversationId, role: "member", status: "active", joinedAt: new Date(0) },
        { userDid: "did:bob", chatRoomId: conversationId, role: "member", status: "active", joinedAt: new Date(1) },
    ];
    assert.deepEqual(await invoke("active", persistedAdmin), { success: true, isAdmin: true });
    assert.deepEqual(await invoke("active", ordinaryMember), { success: true, isAdmin: false });
    assert.deepEqual(await invoke("active", earliestMember), { success: true, isAdmin: false });
    assert.deepEqual(await invoke("paused", persistedAdmin), { success: true, isAdmin: false });
    assert.deepEqual(await invoke("paused", ordinaryMember), { success: true, isAdmin: false });
    const missing = await invoke("active", persistedAdmin, true);
    const unauthorized = await runWithChatActionContext(staleContext({ hydration: 0, unread: 0 }), () =>
        chatActions.canEditGroupInfoAction(conversationId),
    );
    assert.deepEqual(missing, unauthorized);
    await runWithChatActionContext(staleContext({ hydration: 0, unread: 0 }), async () => {
        denied(await chatActions.canEditGroupInfoAction(conversationId), "stale canEditGroupInfoAction");
    });
});

test("persisted active role repair enables subsequent edit capability", async () => {
    const membershipId = new ObjectId();
    let members = [
        {
            _id: membershipId,
            userDid: alice,
            chatRoomId: conversationId,
            role: "member",
            status: "active",
            joinedAt: new Date(0),
        },
    ];
    let repairs = 0;
    await runWithChatActionContext(
        {
            ...staleContext({ hydration: 0, unread: 0 }),
            findCircle: async () => ({ ...secretCircle, moderationStatus: "active" }),
            findCanonicalMember: async () => ({ userDid: alice, circleId }),
            listChatMembers: async () => members,
            updateChatMemberRole: async (filter) => {
                repairs++;
                assert.deepEqual(filter, { _id: membershipId });
                members = members.map((member) => (member._id === filter._id ? { ...member, role: "admin" } : member));
                return { matchedCount: 1, modifiedCount: 1 };
            },
            findUserByDid: async () => ({ did: alice, name: "Alice", handle: "alice" }),
        },
        async () => {
            assert.deepEqual(await chatActions.canEditGroupInfoAction(conversationId), {
                success: true,
                isAdmin: false,
            });
            const repaired = await chatActions.getChatRoomMembersAction(conversationId);
            assert.equal(repaired.success, true);
            assert.equal(repaired.members?.[0]?.role, "admin");
            assert.deepEqual(await chatActions.canEditGroupInfoAction(conversationId), {
                success: true,
                isAdmin: true,
            });
        },
    );
    assert.equal(repairs, 1);
});

test("matched but already-applied role repair is confirmed by matchedCount even when modifiedCount is zero", async () => {
    const membershipId = new ObjectId();
    const members = [
        {
            _id: membershipId,
            userDid: alice,
            chatRoomId: conversationId,
            role: "member",
            status: "active",
            joinedAt: new Date(0),
        },
    ];
    await runWithChatActionContext(
        {
            ...staleContext({ hydration: 0, unread: 0 }),
            findCircle: async () => ({ ...secretCircle, moderationStatus: "active" }),
            findCanonicalMember: async () => ({ userDid: alice, circleId }),
            listChatMembers: async () => members,
            updateChatMemberRole: async (filter) => {
                assert.deepEqual(filter, { _id: membershipId });
                return { matchedCount: 1, modifiedCount: 0 };
            },
            findUserByDid: async () => ({ did: alice, name: "Alice", handle: "alice" }),
        },
        async () => {
            const repaired = await chatActions.getChatRoomMembersAction(conversationId);
            assert.equal(repaired.members?.[0]?.role, "admin");
        },
    );
});

test("non-matching role repair returns the persisted ordinary role and grants no capability", async () => {
    const membershipId = new ObjectId();
    const members = [
        {
            _id: membershipId,
            userDid: alice,
            chatRoomId: conversationId,
            role: "member",
            status: "active",
            joinedAt: new Date(0),
        },
    ];
    let repairs = 0;
    await runWithChatActionContext(
        {
            ...staleContext({ hydration: 0, unread: 0 }),
            findCircle: async () => ({ ...secretCircle, moderationStatus: "active" }),
            findCanonicalMember: async () => ({ userDid: alice, circleId }),
            listChatMembers: async () => members,
            updateChatMemberRole: async (filter) => {
                repairs++;
                assert.deepEqual(filter, { _id: membershipId });
                return { matchedCount: 0, modifiedCount: 0 };
            },
            findUserByDid: async () => ({ did: alice, name: "Alice", handle: "alice" }),
        },
        async () => {
            assert.deepEqual(await chatActions.canEditGroupInfoAction(conversationId), {
                success: true,
                isAdmin: false,
            });
            const unrepaired = await chatActions.getChatRoomMembersAction(conversationId);
            assert.equal(unrepaired.success, true);
            assert.equal(unrepaired.members?.[0]?.role, "member");
            assert.deepEqual(await chatActions.canEditGroupInfoAction(conversationId), {
                success: true,
                isAdmin: false,
            });
        },
    );
    assert.equal(repairs, 1);
});

test("role repair targets the exact earliest active membership row and leaves a duplicate untouched", async () => {
    const earliestId = new ObjectId();
    const duplicateId = new ObjectId();
    let rows = [
        {
            _id: earliestId,
            userDid: alice,
            chatRoomId: conversationId,
            role: "member",
            status: "active",
            joinedAt: new Date(0),
        },
        {
            _id: duplicateId,
            userDid: alice,
            chatRoomId: conversationId,
            role: "member",
            status: "active",
            joinedAt: new Date(1),
        },
    ];
    const targetedIds: unknown[] = [];
    await runWithChatActionContext(
        {
            ...staleContext({ hydration: 0, unread: 0 }),
            findCircle: async () => ({ ...secretCircle, moderationStatus: "active" }),
            findCanonicalMember: async () => ({ userDid: alice, circleId }),
            listChatMembers: async () => rows,
            updateChatMemberRole: async (filter, update) => {
                assert.deepEqual(Object.keys(filter), ["_id"]);
                assert.deepEqual(update, { $set: { role: "admin", status: "active", active: true, isActive: true } });
                targetedIds.push(filter._id);
                rows = rows.map((row) => (row._id === filter._id ? { ...row, ...update.$set } : row));
                return {
                    matchedCount: filter._id === earliestId ? 1 : 0,
                    modifiedCount: filter._id === earliestId ? 1 : 0,
                };
            },
            findUserByDid: async () => ({ did: alice, name: "Alice", handle: "alice" }),
        },
        async () => {
            assert.deepEqual(await chatActions.canEditGroupInfoAction(conversationId), {
                success: true,
                isAdmin: false,
            });
            const repaired = await chatActions.getChatRoomMembersAction(conversationId);
            assert.equal(repaired.success, true);
            assert.equal(repaired.members?.[0]?._id, earliestId.toString());
            assert.equal(repaired.members?.[0]?.role, "admin");
            assert.equal(repaired.members?.[1]?._id, duplicateId.toString());
            assert.equal(repaired.members?.[1]?.role, "member");
            assert.equal(rows[1]._id, duplicateId);
            assert.equal(rows[1].role, "member");
            assert.equal(rows[1].status, "active");
            assert.deepEqual(await chatActions.canEditGroupInfoAction(conversationId), {
                success: true,
                isAdmin: true,
            });
        },
    );
    assert.deepEqual(targetedIds, [earliestId]);
});

test("thrown exact-row role repair preserves participant read without inventing capability", async () => {
    const membershipId = new ObjectId();
    const members = [
        {
            _id: membershipId,
            userDid: alice,
            chatRoomId: conversationId,
            role: "member",
            status: "active",
            joinedAt: new Date(0),
        },
    ];
    const unrelatedEffects: string[] = [];
    await runWithChatActionContext(
        {
            ...staleContext({ hydration: 0, unread: 0 }),
            findCircle: async () => ({ ...secretCircle, moderationStatus: "active" }),
            findCanonicalMember: async () => ({ userDid: alice, circleId }),
            listChatMembers: async () => members,
            updateChatMemberRole: async (filter) => {
                assert.deepEqual(filter, { _id: membershipId });
                throw new Error("simulated persistence failure");
            },
            findUserByDid: async () => ({ did: alice, name: "Alice", handle: "alice" }),
            observeEffect: (effect) => {
                if (effect !== "role-repair") unrelatedEffects.push(effect);
            },
        },
        async () => {
            const result = await chatActions.getChatRoomMembersAction(conversationId);
            assert.equal(result.success, true);
            assert.equal(result.members?.[0]?.role, "member");
            assert.deepEqual(await chatActions.canEditGroupInfoAction(conversationId), {
                success: true,
                isAdmin: false,
            });
        },
    );
    assert.deepEqual(unrelatedEffects, []);
});

test("missing membership row id skips role repair and preserves ordinary capability", async () => {
    let repairs = 0;
    const members = [
        {
            userDid: alice,
            chatRoomId: conversationId,
            role: "member",
            status: "active",
            joinedAt: new Date(0),
        },
    ];
    await runWithChatActionContext(
        {
            ...staleContext({ hydration: 0, unread: 0 }),
            findCircle: async () => ({ ...secretCircle, moderationStatus: "active" }),
            findCanonicalMember: async () => ({ userDid: alice, circleId }),
            listChatMembers: async () => members,
            updateChatMemberRole: async () => {
                repairs++;
                return { matchedCount: 1, modifiedCount: 1 };
            },
            findUserByDid: async () => ({ did: alice, name: "Alice", handle: "alice" }),
        },
        async () => {
            const result = await chatActions.getChatRoomMembersAction(conversationId);
            assert.equal(result.success, true);
            assert.equal(result.members?.[0]?.role, "member");
            assert.deepEqual(await chatActions.canEditGroupInfoAction(conversationId), {
                success: true,
                isAdmin: false,
            });
        },
    );
    assert.equal(repairs, 0);
});

test("unauthorized participant lookup never attempts role repair", async () => {
    let repairs = 0;
    await runWithChatActionContext(
        {
            ...staleContext({ hydration: 0, unread: 0 }),
            updateChatMemberRole: async () => {
                repairs++;
                return { matchedCount: 1, modifiedCount: 1 };
            },
        },
        async () => {
            denied(await chatActions.getChatRoomMembersAction(conversationId), "unauthorized role repair");
        },
    );
    assert.equal(repairs, 0);
});

test("read-receipt compatibility action uses write authorization without adding persistence", async () => {
    const invoke = async (item: any, owner: any, canonical: any = null, chatMember: any = { status: "active" }) =>
        runWithChatActionContext(
            {
                viewerDid: alice,
                findConversation: async () => item,
                findCircle: async () => owner,
                findCanonicalMember: async () => canonical,
                findChatMember: async () => chatMember,
            },
            () => chatActions.sendReadReceiptAction(item?._id?.toString?.() || conversationId, messageId),
        );

    assert.equal((await invoke(conversation, secretCircle, { userDid: alice, circleId })).success, true);
    for (const moderationStatus of ["paused", "suspended", "removed"]) {
        denied(
            await invoke(conversation, { ...secretCircle, moderationStatus }, { userDid: alice, circleId }),
            `receipt ${moderationStatus}`,
        );
    }
    denied(await invoke(conversation, secretCircle, null), "receipt stale Secret member");
    denied(await invoke(null, null), "receipt missing room");
    denied(
        await invoke(
            conversation,
            { ...secretCircle, circleType: "user", visibility: "public" },
            { userDid: alice, circleId },
        ),
        "receipt profile owner",
    );
    denied(
        await invoke(conversation, { ...secretCircle, circleType: undefined }, { userDid: alice, circleId }),
        "receipt malformed owner",
    );
    assert.equal(
        (await invoke({ _id: new ObjectId(), type: "dm", participants: [alice, "did:bob"] }, null)).success,
        true,
    );
    assert.equal((await invoke({ _id: new ObjectId(), type: "group", participants: [alice] }, null)).success, true);
});

test("real listChatRoomsAction performs no ensure, creation, backfill or other write before enrichment", async () => {
    const ownerId = new ObjectId().toHexString();
    const candidates = Array.from({ length: 20 }, () => ({
        _id: new ObjectId(),
        type: "group",
        circleId: ownerId,
        participants: [alice],
        updatedAt: new Date(),
    }));
    const effectCalls = zeroEffectCounters();
    let ensureCalls = 0;
    let hydrationCalls = 0;
    await runWithChatActionContext(
        {
            viewerDid: alice,
            findCanonicalMemberships: async () => [{ userDid: alice, circleId: ownerId }],
            findCandidates: async () => candidates,
            findOwningCircles: async () => [
                {
                    _id: new ObjectId(ownerId),
                    circleType: "circle",
                    visibility: "secret",
                    moderationStatus: "active",
                },
            ],
            findChatMemberships: async () =>
                candidates.map((item) => ({
                    userDid: alice,
                    chatRoomId: item._id.toString(),
                    status: "active",
                })),
            mapConversations: async (_viewer, authorized) => {
                hydrationCalls++;
                assert.equal(authorized.length, 20);
                return [];
            },
            getUnreadCounts: async () => ({}),
            ensureCircleConversation: async () => {
                ensureCalls++;
                throw new Error("sidebar must not ensure conversations");
            },
            observeEffect: (effect) => {
                effectCalls[effect]++;
            },
        },
        async () => {
            assert.deepEqual(await mongoActions.listChatRoomsAction(), { success: true, rooms: [] });
        },
    );
    assert.equal(hydrationCalls, 1);
    assert.equal(ensureCalls, 0);
    assert.deepEqual(effectCalls, zeroEffectCounters());
});

test("DM archive actions use the authenticated user and remain idempotent", async () => {
    const dmId = new ObjectId().toHexString();
    const archivedBy = new Set<string>();
    const calls: Array<{ userDid: string; archived: boolean }> = [];
    await runWithChatActionContext(
        {
            viewerDid: alice,
            updateConversationArchive: async (requestedId, userDid, archived) => {
                calls.push({ userDid, archived });
                if (requestedId !== dmId || userDid !== alice) return { matchedCount: 0 };
                archived ? archivedBy.add(userDid) : archivedBy.delete(userDid);
                return { matchedCount: 1 };
            },
        },
        async () => {
            assert.equal((await mongoActions.archiveDmConversationAction(dmId)).success, true);
            assert.equal((await mongoActions.archiveDmConversationAction(dmId)).success, true);
            assert.deepEqual([...archivedBy], [alice]);
            assert.equal((await mongoActions.unarchiveDmConversationAction(dmId)).success, true);
            assert.equal((await mongoActions.unarchiveDmConversationAction(dmId)).success, true);
            assert.deepEqual([...archivedBy], []);
        },
    );
    assert.deepEqual(calls, [
        { userDid: alice, archived: true },
        { userDid: alice, archived: true },
        { userDid: alice, archived: false },
        { userDid: alice, archived: false },
    ]);
});

test("DM archive actions neutrally reject unauthenticated and unmatched requests", async () => {
    const dmId = new ObjectId().toHexString();
    assert.deepEqual(
        await runWithChatActionContext({ viewerDid: null }, () => mongoActions.archiveDmConversationAction(dmId)),
        { success: false, message: "Not authenticated" },
    );
    await runWithChatActionContext(
        {
            viewerDid: alice,
            updateConversationArchive: async () => ({ matchedCount: 0 }),
        },
        async () => {
            denied(await mongoActions.archiveDmConversationAction(dmId), "archive unauthorized DM");
            denied(await mongoActions.unarchiveDmConversationAction(dmId), "unarchive unauthorized DM");
        },
    );
});

test("archived DM actions allow reads, reject caller writes, and leave the other participant writable", async () => {
    const bob = "did:bob";
    const dmId = new ObjectId().toHexString();
    const archivedDm = {
        _id: new ObjectId(dmId),
        type: "dm",
        participants: [alice, bob],
        archivedBy: [alice],
    };
    const createdBy: string[] = [];
    const contextFor = (viewerDid: string): ChatActionContext => ({
        viewerDid,
        findConversation: async () => archivedDm,
        findMessagingUser: async () => ({
            did: viewerDid,
            circleType: "user",
            picture: { url: `/${viewerDid}.png` },
            description: "complete",
            isAdmin: true,
            isEmailVerified: true,
        }),
        createMessage: async (input) => {
            createdBy.push(input.senderDid);
            return { ...input, _id: new ObjectId().toHexString() };
        },
        notifyMessage: async () => {},
        updateConversationArchive: async (_requestedId, userDid, archived) => {
            archivedDm.archivedBy = archived
                ? Array.from(new Set([...archivedDm.archivedBy, userDid]))
                : archivedDm.archivedBy.filter((did) => did !== userDid);
            return { matchedCount: 1 };
        },
    });

    await runWithChatActionContext(contextFor(alice), async () => {
        assert.equal((await mongoActions.resolveMongoConversationAccess(dmId, alice, "read")).ok, true);
        denied(await mongoActions.sendMongoMessageAction(dmId, "blocked"), "archived participant send");
    });
    await runWithChatActionContext(contextFor(bob), async () => {
        assert.equal((await mongoActions.sendMongoMessageAction(dmId, "allowed")).success, true);
    });
    await runWithChatActionContext(contextFor(alice), async () => {
        assert.equal((await mongoActions.unarchiveDmConversationAction(dmId)).success, true);
        assert.equal((await mongoActions.sendMongoMessageAction(dmId, "restored")).success, true);
    });
    assert.deepEqual(createdBy, [bob, alice]);
});

test("every content mutation family rejects a newly initiated archived-DM operation", async () => {
    const dmId = new ObjectId().toHexString();
    const archivedDm = { _id: new ObjectId(dmId), type: "dm", participants: [alice, "did:bob"], archivedBy: [alice] };
    const effects = zeroEffectCounters();
    const context: ChatActionContext = {
        viewerDid: alice,
        findConversation: async () => archivedDm,
        findMessage: async () => ({ _id: new ObjectId(messageId), conversationId: dmId }),
        findMessagingUser: async () => ({
            did: alice,
            circleType: "user",
            picture: { url: "/alice.png" },
            description: "complete",
            isAdmin: true,
            isEmailVerified: true,
        }),
        observeEffect: (effect) => effects[effect]++,
        saveFile: async () => {
            throw new Error("archived attachment must not upload");
        },
    };
    const attachment = new FormData();
    attachment.set("roomId", dmId);
    attachment.set("file", new File(["x"], "x.txt", { type: "text/plain" }));

    await runWithChatActionContext(context, async () => {
        denied(await mongoActions.sendMongoMessageAction(dmId, "message"), "message");
        denied(await mongoActions.sendMongoAttachmentAction(attachment), "attachment");
        denied(await mongoActions.editMongoMessageAction(messageId, "edit"), "message edit");
        denied(await mongoActions.deleteMongoMessageAction(messageId), "message delete");
        denied(await mongoActions.toggleMongoReactionAction(messageId, "👍"), "reaction");
        denied(await mongoActions.createThreadAction(dmId, "topic", "body", []), "topic create");
        denied(await mongoActions.updateTopicAction(dmId, topicId, "topic", "body"), "topic edit");
        denied(await mongoActions.deleteTopicAction(dmId, topicId), "topic delete");
        denied(await mongoActions.sendThreadReplyAction(topicId, dmId, "reply"), "topic reply");
    });
    assert.deepEqual(effects, zeroEffectCounters());
});

test("an operation authorized before archive may finish afterward", async () => {
    const dmId = new ObjectId().toHexString();
    const bob = "did:bob";
    const dm = { _id: new ObjectId(dmId), type: "dm", participants: [alice, bob], archivedBy: [] as string[] };
    let releasePersistence!: () => void;
    const persistenceBarrier = new Promise<void>((resolve) => (releasePersistence = resolve));
    let authorizationFinished!: () => void;
    const authorized = new Promise<void>((resolve) => (authorizationFinished = resolve));
    const created: string[] = [];

    const send = runWithChatActionContext(
        {
            viewerDid: alice,
            findConversation: async () => dm,
            findMessagingUser: async () => ({
                did: alice,
                circleType: "user",
                picture: { url: "/alice.png" },
                description: "complete",
                isAdmin: true,
                isEmailVerified: true,
            }),
            createMessage: async (input) => {
                authorizationFinished();
                await persistenceBarrier;
                created.push(input.body);
                return { ...input, _id: new ObjectId().toHexString() };
            },
            notifyMessage: async () => {},
        },
        () => mongoActions.sendMongoMessageAction(dmId, "already in flight"),
    );

    await authorized;
    dm.archivedBy.push(alice);
    releasePersistence();
    assert.equal((await send).success, true);
    assert.deepEqual(created, ["already in flight"]);
    await runWithChatActionContext(
        {
            viewerDid: alice,
            findConversation: async () => dm,
            findMessagingUser: async () => ({
                did: alice,
                circleType: "user",
                picture: { url: "/alice.png" },
                description: "complete",
                isAdmin: true,
                isEmailVerified: true,
            }),
        },
        async () => {
            denied(await mongoActions.sendMongoMessageAction(dmId, "new request"), "post-archive request");
        },
    );
});
