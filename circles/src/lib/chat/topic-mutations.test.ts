import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { buildConversationUpdatedAtCompareAndSetFilter } from "./topic-mutations";

describe("buildConversationUpdatedAtCompareAndSetFilter", () => {
    const id = new ObjectId();

    test("matches the conversation at the timestamp that was observed", () => {
        const observed = new Date("2026-06-15T12:00:00.000Z");

        expect(buildConversationUpdatedAtCompareAndSetFilter(id, observed)).toEqual({ _id: id, updatedAt: observed });
    });

    test("requires updatedAt to be absent when no timestamp was observed", () => {
        expect(buildConversationUpdatedAtCompareAndSetFilter(id)).toEqual({ _id: id, updatedAt: { $exists: false } });
        expect(buildConversationUpdatedAtCompareAndSetFilter(id, undefined)).toEqual({
            _id: id,
            updatedAt: { $exists: false },
        });
    });

    test("uses the same date instance rather than a copy", () => {
        const observed = new Date();

        expect(buildConversationUpdatedAtCompareAndSetFilter(id, observed).updatedAt).toBe(observed);
    });

    test("passes the conversation id through untouched, whatever its type", () => {
        expect(buildConversationUpdatedAtCompareAndSetFilter("plain-string-id")._id).toBe("plain-string-id");
        expect(buildConversationUpdatedAtCompareAndSetFilter(id)._id).toBe(id);
    });
});
