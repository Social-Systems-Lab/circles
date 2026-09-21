import { describe, expect, test } from "bun:test";
import {
    SYSTEM_TYPE_TO_LEGACY_SOURCE,
    buildSystemMessageMetadata,
    isSystemMessageMetadata,
    normalizeSystemMessageMetadata,
    toLegacySystemSource,
} from "./system-messages";

const SYSTEM_TYPES = [
    "welcome",
    "group_chat_joined",
    "group_chat_left",
    "group_chat_member_added",
    "group_chat_member_removed",
    "group_chat_admin_promoted",
    "announcement",
] as const;

describe("SYSTEM_TYPE_TO_LEGACY_SOURCE / toLegacySystemSource", () => {
    test("maps every system type to a system_ prefixed legacy source", () => {
        expect(SYSTEM_TYPE_TO_LEGACY_SOURCE).toEqual({
            welcome: "system_welcome",
            group_chat_joined: "system_group_chat_joined",
            group_chat_left: "system_group_chat_left",
            group_chat_member_added: "system_group_chat_member_added",
            group_chat_member_removed: "system_group_chat_member_removed",
            group_chat_admin_promoted: "system_group_chat_admin_promoted",
            announcement: "system_announcement",
        });
    });

    test.each([...SYSTEM_TYPES])("toLegacySystemSource(%s) is the mapped source", (systemType) => {
        expect(toLegacySystemSource(systemType)).toBe(SYSTEM_TYPE_TO_LEGACY_SOURCE[systemType]);
    });
});

describe("isSystemMessageMetadata", () => {
    test("is true only for system messages", () => {
        expect(isSystemMessageMetadata({ messageType: "system" })).toBe(true);
        expect(isSystemMessageMetadata({ messageType: "user" })).toBe(false);
    });

    test("is false without metadata", () => {
        expect(isSystemMessageMetadata()).toBe(false);
        expect(isSystemMessageMetadata(null)).toBe(false);
        expect(isSystemMessageMetadata(undefined)).toBe(false);
    });
});

describe("buildSystemMessageMetadata", () => {
    test("marks the message as a system message with the given type and source", () => {
        expect(buildSystemMessageMetadata({ systemType: "welcome", source: "signup" })).toEqual({
            messageType: "system",
            systemType: "welcome",
            source: "signup",
            actorDid: undefined,
            targetDid: undefined,
            circleId: undefined,
            chatRoomId: undefined,
            repliesDisabled: undefined,
            templateKey: undefined,
            version: undefined,
        });
    });

    test("carries over every optional field", () => {
        expect(
            buildSystemMessageMetadata({
                systemType: "group_chat_member_added",
                source: "group_chat_membership",
                actorDid: "did:actor",
                targetDid: "did:target",
                circleId: "circle-1",
                chatRoomId: "room-1",
                repliesDisabled: true,
                templateKey: "member_added",
                version: "v2",
            }),
        ).toEqual({
            messageType: "system",
            systemType: "group_chat_member_added",
            source: "group_chat_membership",
            actorDid: "did:actor",
            targetDid: "did:target",
            circleId: "circle-1",
            chatRoomId: "room-1",
            repliesDisabled: true,
            templateKey: "member_added",
            version: "v2",
        });
    });

    test("keeps repliesDisabled false rather than dropping it", () => {
        expect(buildSystemMessageMetadata({ systemType: "announcement", source: "admin", repliesDisabled: false }).repliesDisabled).toBe(false);
    });

    test("is recognized as system metadata", () => {
        expect(isSystemMessageMetadata(buildSystemMessageMetadata({ systemType: "welcome", source: "signup" }))).toBe(true);
    });

    test("does not validate that the source fits the type", () => {
        expect(buildSystemMessageMetadata({ systemType: "welcome", source: "admin" })).toMatchObject({ systemType: "welcome", source: "admin" });
    });
});

describe("normalizeSystemMessageMetadata", () => {
    describe("structured metadata", () => {
        test.each([...SYSTEM_TYPES])("keeps the system type %s", (systemType) => {
            expect(normalizeSystemMessageMetadata({ system: { messageType: "system", systemType } }).systemType).toBe(systemType);
        });

        test.each(["signup", "group_chat_membership", "admin", "platform_admin"])("keeps the source %s", (source) => {
            expect(normalizeSystemMessageMetadata({ system: { messageType: "system", source } }).source).toBe(source as never);
        });

        test.each([
            ["welcome", "signup"],
            ["group_chat_joined", "group_chat_membership"],
            ["group_chat_left", "group_chat_membership"],
            ["group_chat_member_added", "group_chat_membership"],
            ["group_chat_member_removed", "group_chat_membership"],
            ["group_chat_admin_promoted", "group_chat_membership"],
            ["announcement", "admin"],
        ])("infers the source of a %s message as %s when none is given", (systemType, source) => {
            expect(normalizeSystemMessageMetadata({ system: { systemType } }).source).toBe(source as never);
        });

        test("prefers an explicit source over the inferred one", () => {
            expect(normalizeSystemMessageMetadata({ system: { systemType: "welcome", source: "platform_admin" } }).source).toBe("platform_admin");
        });

        test("maps the early v1 type and source names to their current equivalents", () => {
            expect(normalizeSystemMessageMetadata({ system: { systemType: "member_joined_circle" } }).systemType).toBe("group_chat_joined");
            expect(normalizeSystemMessageMetadata({ system: { systemType: "member_left_circle" } }).systemType).toBe("group_chat_left");
            expect(normalizeSystemMessageMetadata({ system: { source: "circle_membership" } }).source).toBe("group_chat_membership");
        });

        test("drops unknown types and sources", () => {
            expect(normalizeSystemMessageMetadata({ system: { messageType: "system", systemType: "bogus", source: "bogus" } })).toEqual({
                messageType: "system",
                systemType: undefined,
                source: undefined,
                actorDid: undefined,
                targetDid: undefined,
                circleId: undefined,
                chatRoomId: undefined,
                repliesDisabled: undefined,
                templateKey: undefined,
                version: undefined,
            });
        });

        test("infers a system message from a known type or source even without a messageType", () => {
            expect(normalizeSystemMessageMetadata({ system: { systemType: "welcome" } }).messageType).toBe("system");
            expect(normalizeSystemMessageMetadata({ system: { source: "admin" } }).messageType).toBe("system");
        });

        test("also treats a messageType of user as system when it carries a type or source", () => {
            expect(normalizeSystemMessageMetadata({ system: { messageType: "user", systemType: "welcome" } }).messageType).toBe("system");
        });

        test("treats a plain user message as a user message", () => {
            expect(normalizeSystemMessageMetadata({ system: { messageType: "user" } })).toEqual({ messageType: "user" });
        });

        test("copies the participants, circle, room and template when they are non-empty strings", () => {
            expect(
                normalizeSystemMessageMetadata({
                    system: {
                        messageType: "system",
                        actorDid: "did:actor",
                        targetDid: "did:target",
                        circleId: "circle-1",
                        chatRoomId: "room-1",
                        templateKey: "tpl",
                    },
                }),
            ).toMatchObject({
                actorDid: "did:actor",
                targetDid: "did:target",
                circleId: "circle-1",
                chatRoomId: "room-1",
                templateKey: "tpl",
            });
        });

        test.each(["", "   ", 5, null, {}, true])("drops the invalid string field %p", (value) => {
            const result = normalizeSystemMessageMetadata({
                system: { messageType: "system", actorDid: value, targetDid: value, circleId: value, chatRoomId: value, templateKey: value },
            });

            expect(result.actorDid).toBeUndefined();
            expect(result.targetDid).toBeUndefined();
            expect(result.circleId).toBeUndefined();
            expect(result.chatRoomId).toBeUndefined();
            expect(result.templateKey).toBeUndefined();
        });

        test("keeps a string field untrimmed when it has content", () => {
            expect(normalizeSystemMessageMetadata({ system: { messageType: "system", actorDid: "  did:x " } }).actorDid).toBe("  did:x ");
        });

        describe("repliesDisabled", () => {
            test("uses the value stored with the system metadata", () => {
                expect(normalizeSystemMessageMetadata({ system: { messageType: "system", repliesDisabled: false }, repliesDisabled: true }).repliesDisabled).toBe(false);
                expect(normalizeSystemMessageMetadata({ system: { messageType: "system", repliesDisabled: true } }).repliesDisabled).toBe(true);
            });

            test("falls back to the conversation-level value", () => {
                expect(normalizeSystemMessageMetadata({ system: { messageType: "system" }, repliesDisabled: true }).repliesDisabled).toBe(true);
            });

            test("ignores a stored value that is not a boolean", () => {
                expect(normalizeSystemMessageMetadata({ system: { messageType: "system", repliesDisabled: "yes" }, repliesDisabled: true }).repliesDisabled).toBe(true);
                expect(normalizeSystemMessageMetadata({ system: { messageType: "system", repliesDisabled: "yes" } }).repliesDisabled).toBeUndefined();
            });
        });

        describe("version", () => {
            test("prefers the version stored with the system metadata", () => {
                expect(normalizeSystemMessageMetadata({ system: { messageType: "system", version: "v3" }, version: "v1" }).version).toBe("v3");
            });

            test("falls back to the message-level version", () => {
                expect(normalizeSystemMessageMetadata({ system: { messageType: "system" }, version: "v1" }).version).toBe("v1");
            });

            test("ignores blank versions", () => {
                expect(normalizeSystemMessageMetadata({ system: { messageType: "system", version: " " }, version: "" }).version).toBeUndefined();
            });
        });

        test.each([null, undefined, "system", 5, ["system"], true])("ignores metadata that is %p and falls through to the legacy source", (system) => {
            expect(normalizeSystemMessageMetadata({ system, source: "system_welcome" }).messageType).toBe("system");
            expect(normalizeSystemMessageMetadata({ system })).toEqual({ messageType: "user" });
        });
    });

    describe("legacy source", () => {
        test.each([...SYSTEM_TYPES])("recognizes the legacy source of a %s message", (systemType) => {
            const source = SYSTEM_TYPE_TO_LEGACY_SOURCE[systemType];

            expect(normalizeSystemMessageMetadata({ source }).systemType).toBe(systemType);
            expect(normalizeSystemMessageMetadata({ source }).messageType).toBe("system");
        });

        test("infers the modern source from the legacy one", () => {
            expect(normalizeSystemMessageMetadata({ source: "system_welcome" }).source).toBe("signup");
            expect(normalizeSystemMessageMetadata({ source: "system_group_chat_left" }).source).toBe("group_chat_membership");
            expect(normalizeSystemMessageMetadata({ source: "system_announcement" }).source).toBe("admin");
        });

        test("recognizes the early v1 legacy sources", () => {
            expect(normalizeSystemMessageMetadata({ source: "system_member_joined_circle" })).toMatchObject({
                systemType: "group_chat_joined",
                source: "group_chat_membership",
            });
            expect(normalizeSystemMessageMetadata({ source: "system_member_left_circle" }).systemType).toBe("group_chat_left");
        });

        test("assigns the welcome template key only to welcome messages", () => {
            expect(normalizeSystemMessageMetadata({ source: "system_welcome" }).templateKey).toBe("welcome");
            expect(normalizeSystemMessageMetadata({ source: "system_announcement" }).templateKey).toBeUndefined();
        });

        test("carries the message-level version and replies flag", () => {
            expect(normalizeSystemMessageMetadata({ source: "system_welcome", version: "v2", repliesDisabled: true })).toEqual({
                messageType: "system",
                systemType: "welcome",
                source: "signup",
                repliesDisabled: true,
                templateKey: "welcome",
                version: "v2",
            });
        });

        test("passes an unknown system_ source through as a system message without a type", () => {
            expect(normalizeSystemMessageMetadata({ source: "system_something_new" })).toEqual({
                messageType: "system",
                systemType: undefined,
                source: undefined,
                repliesDisabled: undefined,
                templateKey: undefined,
                version: undefined,
            });
        });

        test("structured metadata takes precedence over the legacy source", () => {
            expect(normalizeSystemMessageMetadata({ system: { systemType: "announcement" }, source: "system_welcome" }).systemType).toBe("announcement");
        });
    });

    describe("ordinary messages", () => {
        test.each([undefined, null, "", "   ", "web", "user_message", "System_welcome"])("are user messages for source %p", (source) => {
            expect(normalizeSystemMessageMetadata({ source })).toEqual({ messageType: "user" });
        });

        test("are user messages without any input", () => {
            expect(normalizeSystemMessageMetadata({})).toEqual({ messageType: "user" });
        });

        test("ignore the version and replies flag", () => {
            expect(normalizeSystemMessageMetadata({ version: "v2", repliesDisabled: true })).toEqual({ messageType: "user" });
        });
    });
});
