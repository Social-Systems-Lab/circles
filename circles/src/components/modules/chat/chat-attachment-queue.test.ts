import assert from "node:assert/strict";
import test from "node:test";
import {
    buildComposerScopeKey,
    buildComposedMessageFormData,
    buildComposedMessageSignature,
    getStableSubmissionId,
    removeQueuedAttachment,
    validateFilesForQueue,
    type QueuedChatAttachment,
} from "./chat-attachment-queue";

const file = (name: string, size: number) => new File([new Uint8Array(size)], name, { type: "text/plain" });

test("queue validation accepts multiple files within backend limits", () => {
    const selected = [file("one.txt", 10), file("two.txt", 20)];
    assert.deepEqual(validateFilesForQueue([], selected), { accepted: selected });
});

test("queue validation enforces count, per-file and combined limits", () => {
    assert.match(
        validateFilesForQueue(
            [],
            Array.from({ length: 11 }, (_, index) => file(`${index}.txt`, 1)),
        ).error!,
        /10/,
    );
    assert.match(validateFilesForQueue([], [file("large.bin", 5 * 1024 * 1024 + 1)]).error!, /5MB/);
    assert.match(
        validateFilesForQueue([file("existing.bin", 25 * 1024 * 1024)], [file("extra.bin", 1)]).error!,
        /25MB/,
    );
});

test("removal affects only the selected local queue item", () => {
    const first: QueuedChatAttachment = { id: "one", file: file("one.txt", 1), previewUrl: "blob:one" };
    const second: QueuedChatAttachment = { id: "two", file: file("two.txt", 1) };
    const result = removeQueuedAttachment([first, second], "one");
    assert.deepEqual(result.attachments, [second]);
    assert.equal(result.removed, first);
});

test("stable submission IDs are reused for the same payload and replaced after a real change", () => {
    let generated = 0;
    const createId = () => `submission-${++generated}`;
    const first = getStableSubmissionId(null, "same", createId);
    const retry = getStableSubmissionId(first, "same", createId);
    const changed = getStableSubmissionId(retry, "changed", createId);
    assert.equal(retry.submissionId, first.submissionId);
    assert.notEqual(changed.submissionId, first.submissionId);
});

test("conversation and topic signatures are isolated", () => {
    const attachment = { id: "one", file: file("one.txt", 1) };
    const conversation = buildComposedMessageSignature({
        scopeKey: buildComposerScopeKey("conversation"),
        body: "body",
        attachments: [attachment],
    });
    const topic = buildComposedMessageSignature({
        scopeKey: buildComposerScopeKey("conversation", "topic"),
        body: "body",
        attachments: [attachment],
    });
    assert.notEqual(conversation, topic);
});

test("main and topic composed payloads preserve files, reply target and topic identity", () => {
    const attachments = [
        { id: "one", file: file("one.txt", 1) },
        { id: "two", file: file("two.txt", 2) },
    ];
    const main = buildComposedMessageFormData({
        conversationId: "conversation",
        body: "Main message",
        replyToMessageId: "main-reply",
        submissionId: "main-submission",
        attachments,
    });
    assert.equal(main.get("roomId"), "conversation");
    assert.equal(main.get("threadId"), null);
    assert.equal(main.get("replyToMessageId"), "main-reply");
    assert.deepEqual(
        main.getAll("files").map((entry) => (entry as File).name),
        ["one.txt", "two.txt"],
    );

    const topic = buildComposedMessageFormData({
        conversationId: "conversation",
        topicId: "topic",
        body: "",
        replyToMessageId: "topic-reply",
        submissionId: "topic-submission",
        attachments,
    });
    assert.equal(topic.get("threadId"), "topic");
    assert.equal(topic.get("body"), "");
    assert.equal(topic.get("replyToMessageId"), "topic-reply");
    assert.equal(topic.get("submissionId"), "topic-submission");
});
