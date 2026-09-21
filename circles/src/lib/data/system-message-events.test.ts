import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ObjectId } from "mongodb";
import { useFakeNow } from "@/test/hooks";
import { mockDb } from "@/test/mock-db";

const db = mockDb();

const circlesByDid = new Map<string, Record<string, unknown>>();
const getCircleByDid = mock(async (did: string) => circlesByDid.get(did) ?? null);
const getCircleByHandle = mock(async (_handle: string): Promise<Record<string, unknown> | null> => null);
mock.module("@/lib/data/circle", () => ({ getCircleByDid, getCircleByHandle }));

const createMessage = mock(async (message: Record<string, unknown>) => ({ ...message, _id: new ObjectId("507f1f77bcf86cd799439011") }));
mock.module("@/lib/data/mongo-chat", () => ({ createMessage }));

const events = await import("./system-message-events");

const NOW = new Date("2026-06-15T12:00:00.000Z");
useFakeNow(NOW);
const created = () => createMessage.mock.calls[0][0] as Record<string, any>;

beforeEach(() => {
    db.ChatMessageDocs.docs = [];
    circlesByDid.clear();
    getCircleByDid.mockClear();
    getCircleByHandle.mockReset();
    getCircleByHandle.mockResolvedValue(null);
    createMessage.mockClear();
});

describe("buildWelcomeSystemMessageMetadata", () => {
    test("marks the message as the signup welcome for the target", () => {
        expect(events.buildWelcomeSystemMessageMetadata({ targetDid: "did:new", repliesDisabled: true, version: "v2" })).toEqual({
            messageType: "system",
            systemType: "welcome",
            source: "signup",
            actorDid: undefined,
            targetDid: "did:new",
            circleId: undefined,
            chatRoomId: undefined,
            repliesDisabled: true,
            templateKey: "welcome",
            version: "v2",
        });
    });
});

describe("sendSystemMessage", () => {
    const send = (overrides: Record<string, unknown> = {}) =>
        events.sendSystemMessage({
            conversationId: "conv-1",
            body: "Hello",
            systemType: "announcement",
            source: "admin",
            ...overrides,
        } as Parameters<typeof events.sendSystemMessage>[0]);

    test("rejects a missing conversation id without creating anything", async () => {
        await expect(send({ conversationId: "" })).rejects.toThrow("Missing conversationId for system message");

        expect(createMessage).not.toHaveBeenCalled();
    });

    test("creates the message with system metadata and the legacy source", async () => {
        const result = await send({ actorDid: "did:actor", targetDid: "did:target", circleId: "c1", chatRoomId: "room-1", version: "v1", templateKey: "tpl", repliesDisabled: true, format: "markdown" });

        expect(result).toEqual({ created: true, messageId: "507f1f77bcf86cd799439011" });
        expect(created()).toEqual({
            conversationId: "conv-1",
            senderDid: "system:kamooni",
            body: "Hello",
            createdAt: NOW,
            format: "markdown",
            source: "system_announcement",
            version: "v1",
            system: {
                messageType: "system",
                systemType: "announcement",
                source: "admin",
                actorDid: "did:actor",
                targetDid: "did:target",
                circleId: "c1",
                chatRoomId: "room-1",
                repliesDisabled: true,
                templateKey: "tpl",
                version: "v1",
            },
        });
    });

    describe("sender", () => {
        test("is the system circle's did when that circle exists", async () => {
            getCircleByHandle.mockResolvedValue({ did: "did:kamooni-circle" });

            await send();

            expect(getCircleByHandle).toHaveBeenCalledWith("kamooni");
            expect(created().senderDid).toBe("did:kamooni-circle");
        });

        test("falls back to a synthetic system did when there is no system circle", async () => {
            await send();

            expect(created().senderDid).toBe("system:kamooni");
        });

        test("falls back when the system circle has no did", async () => {
            getCircleByHandle.mockResolvedValue({ handle: "kamooni" });

            await send();

            expect(created().senderDid).toBe("system:kamooni");
        });

        test("uses an explicit sender without looking anything up", async () => {
            await send({ senderDid: "did:custom" });

            expect(created().senderDid).toBe("did:custom");
            expect(getCircleByHandle).not.toHaveBeenCalled();
        });
    });

    describe("de-duplication", () => {
        const seedDuplicate = (overrides: Record<string, unknown> = {}) => {
            const _id = new ObjectId();
            db.ChatMessageDocs.docs.push({
                _id,
                conversationId: "conv-1",
                createdAt: new Date(NOW.getTime() - 10_000),
                system: { messageType: "system", systemType: "announcement" },
                ...overrides,
            });
            return _id;
        };

        test.each([[undefined], [0], [-5]])("is off when the window is %p", async (dedupeWindowMs) => {
            seedDuplicate();

            const result = await send({ dedupeWindowMs });

            expect(result.created).toBe(true);
            expect(createMessage).toHaveBeenCalledTimes(1);
        });

        test("returns the matching recent message instead of creating another", async () => {
            const id = seedDuplicate();

            const result = await send({ dedupeWindowMs: 30_000 });

            expect(result).toEqual({ created: false, messageId: id.toString() });
            expect(createMessage).not.toHaveBeenCalled();
        });

        test("ignores messages older than the window", async () => {
            seedDuplicate({ createdAt: new Date(NOW.getTime() - 31_000) });

            expect((await send({ dedupeWindowMs: 30_000 })).created).toBe(true);
        });

        test("counts a message exactly at the edge of the window as a duplicate", async () => {
            seedDuplicate({ createdAt: new Date(NOW.getTime() - 30_000) });

            expect((await send({ dedupeWindowMs: 30_000 })).created).toBe(false);
        });

        test("only matches messages of the same conversation and system type", async () => {
            seedDuplicate({ conversationId: "other-conversation" });
            seedDuplicate({ system: { messageType: "system", systemType: "welcome" } });
            seedDuplicate({ system: { messageType: "user", systemType: "announcement" } });

            expect((await send({ dedupeWindowMs: 30_000 })).created).toBe(true);
        });

        test.each([
            ["actor", "actorDid", "did:actor"],
            ["target", "targetDid", "did:target"],
            ["circle", "circleId", "c1"],
            ["chat room", "chatRoomId", "room-1"],
        ])("also requires the same %s when one is given", async (_label, field, value) => {
            seedDuplicate({ system: { messageType: "system", systemType: "announcement", [field]: "someone-else" } });

            expect((await send({ dedupeWindowMs: 30_000, [field]: value })).created).toBe(true);

            db.ChatMessageDocs.docs = [];
            seedDuplicate({ system: { messageType: "system", systemType: "announcement", [field]: value } });

            expect((await send({ dedupeWindowMs: 30_000, [field]: value })).created).toBe(false);
        });

        test("matches on the most recent duplicate", async () => {
            seedDuplicate({ createdAt: new Date(NOW.getTime() - 20_000) });
            const newest = seedDuplicate({ createdAt: new Date(NOW.getTime() - 1_000) });

            expect((await send({ dedupeWindowMs: 30_000 })).messageId).toBe(newest.toString());
        });
    });
});

describe("emitGroupChatMembershipSystemEvent", () => {
    const person = (did: string, fields: Record<string, unknown>) => circlesByDid.set(did, { did, ...fields });
    const emit = (eventType: string, actorDid?: string, targetDid = "did:target") =>
        events.emitGroupChatMembershipSystemEvent({ conversationId: "conv-1", eventType, actorDid, targetDid } as never);

    beforeEach(() => {
        person("did:target", { name: "Tess Target", handle: "tess" });
        person("did:actor", { name: "Adam Actor", handle: "adam" });
    });

    test.each([
        ["group_chat_joined", "Tess Target joined the group chat."],
        ["group_chat_left", "Tess Target left the group chat."],
    ])("words %s without an actor", async (eventType, body) => {
        await emit(eventType, "did:target");

        expect(created().body).toBe(body);
    });

    test.each([
        ["group_chat_member_added", "Adam Actor added Tess Target to the group chat."],
        ["group_chat_member_removed", "Adam Actor removed Tess Target from the group chat."],
        ["group_chat_admin_promoted", "Adam Actor made Tess Target a group admin."],
    ])("words %s with an actor", async (eventType, body) => {
        await emit(eventType, "did:actor");

        expect(created().body).toBe(body);
    });

    test.each([
        ["group_chat_member_added", "Tess Target was added to the group chat."],
        ["group_chat_member_removed", "Tess Target was removed from the group chat."],
        ["group_chat_admin_promoted", "Tess Target is now a group admin."],
    ])("words %s without an actor", async (eventType, body) => {
        await emit(eventType, undefined);

        expect(created().body).toBe(body);
    });

    test("does not credit someone with acting on themselves", async () => {
        await emit("group_chat_member_added", "did:target");

        expect(created().body).toBe("Tess Target was added to the group chat.");
    });

    test("only looks up the actor when there is one", async () => {
        await emit("group_chat_joined", undefined);

        expect(getCircleByDid.mock.calls.map(([did]) => did)).toEqual(["did:target"]);
    });

    describe("names", () => {
        test("fall back from name to handle to a generic label", async () => {
            person("did:target", { handle: "tess" });
            await emit("group_chat_joined");
            expect(created().body).toBe("tess joined the group chat.");

            createMessage.mockClear();
            person("did:target", {});
            await emit("group_chat_joined");
            expect(created().body).toBe("A member joined the group chat.");
        });

        test("use the generic label for people who cannot be found", async () => {
            circlesByDid.clear();

            await emit("group_chat_member_added", "did:actor");

            expect(created().body).toBe("A member added A member to the group chat.");
        });
    });

    test("records the event as a group chat membership system message", async () => {
        await emit("group_chat_member_added", "did:actor");

        expect(created()).toMatchObject({
            conversationId: "conv-1",
            source: "system_group_chat_member_added",
            version: "v1",
            system: {
                messageType: "system",
                systemType: "group_chat_member_added",
                source: "group_chat_membership",
                actorDid: "did:actor",
                targetDid: "did:target",
                chatRoomId: "conv-1",
                templateKey: "group_chat_member_added",
                version: "v1",
            },
        });
    });

    test("does not repeat the same event within 30 seconds", async () => {
        const first = await emit("group_chat_joined", "did:target");
        db.ChatMessageDocs.docs.push({
            _id: new ObjectId(first.messageId),
            conversationId: "conv-1",
            createdAt: new Date(NOW.getTime() - 5_000),
            system: { messageType: "system", systemType: "group_chat_joined", actorDid: "did:target", targetDid: "did:target", chatRoomId: "conv-1" },
        });
        createMessage.mockClear();

        const second = await emit("group_chat_joined", "did:target");

        expect(second).toEqual({ created: false, messageId: first.messageId });
        expect(createMessage).not.toHaveBeenCalled();
    });

    test("does repeat the event after the window has passed", async () => {
        db.ChatMessageDocs.docs.push({
            _id: new ObjectId(),
            conversationId: "conv-1",
            createdAt: new Date(NOW.getTime() - 60_000),
            system: { messageType: "system", systemType: "group_chat_joined", actorDid: "did:target", targetDid: "did:target", chatRoomId: "conv-1" },
        });

        expect((await emit("group_chat_joined", "did:target")).created).toBe(true);
    });

    test("does not confuse events for different members", async () => {
        db.ChatMessageDocs.docs.push({
            _id: new ObjectId(),
            conversationId: "conv-1",
            createdAt: new Date(NOW.getTime() - 5_000),
            system: { messageType: "system", systemType: "group_chat_joined", actorDid: "did:other", targetDid: "did:other", chatRoomId: "conv-1" },
        });

        expect((await emit("group_chat_joined", "did:target")).created).toBe(true);
    });
});
