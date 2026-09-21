import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { parseEventSubmitStage, resolveEventCreationCapability } from "./event-publish-capability";

describe("parseEventSubmitStage", () => {
    test.each(["draft", "review", "open", "preserve"] as const)("keeps the valid stage %s", (stage) => {
        expect(parseEventSubmitStage(stage)).toBe(stage);
    });

    test("falls back to draft for anything else", () => {
        for (const value of [undefined, null, "", "published", "OPEN", " open", 1, true, {}, ["open"]]) {
            expect(parseEventSubmitStage(value)).toBe("draft");
        }
    });
});

describe("resolveEventCreationCapability", () => {
    const host = (id: string, canCreateEvents: boolean, canPublishEvents: boolean) => ({
        _id: id as unknown as ObjectId,
        canCreateEvents,
        canPublishEvents,
    });

    test("is unavailable when no host circle is selected", () => {
        expect(resolveEventCreationCapability([], [host("a", true, true)])).toBe("unavailable");
    });

    test("ignores blank ids, so only blanks means unavailable", () => {
        expect(resolveEventCreationCapability(["", ""], [host("a", true, true)])).toBe("unavailable");
    });

    test("is unavailable when the selected host is unknown", () => {
        expect(resolveEventCreationCapability(["missing"], [host("a", true, true)])).toBe("unavailable");
    });

    test("is unavailable when the host cannot create events", () => {
        expect(resolveEventCreationCapability(["a"], [host("a", false, true)])).toBe("unavailable");
    });

    test("allows draft or review when the host can create but not publish", () => {
        expect(resolveEventCreationCapability(["a"], [host("a", true, false)])).toBe("draft-or-review");
    });

    test("allows draft or publish when the host can create and publish", () => {
        expect(resolveEventCreationCapability(["a"], [host("a", true, true)])).toBe("draft-or-publish");
    });

    test("requires creation rights on every selected host", () => {
        const hosts = [host("a", true, true), host("b", false, true)];
        expect(resolveEventCreationCapability(["a", "b"], hosts)).toBe("unavailable");
    });

    test("falls back to review when any selected host cannot publish", () => {
        const hosts = [host("a", true, true), host("b", true, false)];
        expect(resolveEventCreationCapability(["a", "b"], hosts)).toBe("draft-or-review");
    });

    test("allows publishing only when every selected host can publish", () => {
        const hosts = [host("a", true, true), host("b", true, true)];
        expect(resolveEventCreationCapability(["a", "b"], hosts)).toBe("draft-or-publish");
    });

    test("de-duplicates repeated selections", () => {
        expect(resolveEventCreationCapability(["a", "a"], [host("a", true, true)])).toBe("draft-or-publish");
    });

    test("only considers the selected hosts, not every known host", () => {
        const hosts = [host("a", true, true), host("b", false, false)];
        expect(resolveEventCreationCapability(["a"], hosts)).toBe("draft-or-publish");
    });

    test("matches ObjectId host ids by their string form", () => {
        const id = new ObjectId();
        const hosts = [{ _id: id, canCreateEvents: true, canPublishEvents: true }];
        expect(resolveEventCreationCapability([id.toString()], hosts)).toBe("draft-or-publish");
    });

    test("is unavailable when no host circles are known", () => {
        expect(resolveEventCreationCapability(["a"], [])).toBe("unavailable");
    });
});
