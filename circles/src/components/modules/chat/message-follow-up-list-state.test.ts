import assert from "node:assert/strict";
import test from "node:test";
import type { ChatFollowUpListItem } from "@/lib/data/chat-message-followups";
import {
    mergeFollowUpPages,
    moveFollowUpBetweenFilters,
    reconcileFollowUpListResponse,
    updateFollowUpNoteInItems,
} from "./message-follow-up-list-state";

const item = (id: string, note?: string): ChatFollowUpListItem =>
    ({
        followUp: {
            id,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
            ...(note ? { note } : {}),
        },
        message: null,
        unavailableReason: "unavailable",
    }) as ChatFollowUpListItem;

test("cursor pages deduplicate follow-ups by id while accepting newer data", () => {
    const merged = mergeFollowUpPages([item("1", "old")], [item("1", "new"), item("2")]);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].followUp.note, "new");
});

test("note updates trim text and clearing removes the note", () => {
    assert.equal(updateFollowUpNoteInItems([item("1")], "1", "  private  ")[0].followUp.note, "private");
    assert.equal(updateFollowUpNoteInItems([item("1", "private")], "1", "   ")[0].followUp.note, undefined);
});

test("completion and reopening move only the affected item between cached filters", () => {
    const completed = moveFollowUpBetweenFilters([item("1"), item("2")], [item("3")], "1", true);
    assert.deepEqual(
        completed.source.map((value) => value.followUp.id),
        ["2"],
    );
    assert.deepEqual(
        completed.destination.map((value) => value.followUp.id),
        ["1", "3"],
    );
    assert.ok(completed.destination[0].followUp.completedAt);

    const reopened = moveFollowUpBetweenFilters(completed.destination, completed.source, "1", false);
    assert.equal(
        reopened.source.some((value) => value.followUp.id === "1"),
        false,
    );
    assert.equal(reopened.destination[0].followUp.completedAt, undefined);
});

test("an older list response cannot undo note edits or filter moves", () => {
    const mutations = new Map([
        ["1", { version: 1 }],
        ["2", { version: 2, destination: "completed" as const }],
        ["3", { version: 3, destination: "open" as const }],
    ]);
    const currentOpen = [item("1", "new note"), item("3")];
    const reconciledOpen = reconcileFollowUpListResponse({
        current: currentOpen,
        incoming: [item("1", "old note"), item("2")],
        filter: "open",
        requestMutationVersion: 0,
        mutations,
        loadMore: false,
    });
    assert.deepEqual(
        reconciledOpen.map((value) => value.followUp.id),
        ["3", "1"],
    );
    assert.equal(reconciledOpen.find((value) => value.followUp.id === "1")?.followUp.note, "new note");
});

test("race reconciliation preserves cursor-page deduplication", () => {
    const reconciled = reconcileFollowUpListResponse({
        current: [item("1")],
        incoming: [item("1", "server"), item("2")],
        filter: "open",
        requestMutationVersion: 0,
        mutations: new Map(),
        loadMore: true,
    });
    assert.deepEqual(
        reconciled.map((value) => value.followUp.id),
        ["1", "2"],
    );
    assert.equal(reconciled[0].followUp.note, "server");
});
