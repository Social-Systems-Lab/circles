import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    appendFilesToQueue,
    buildComposerScopeKey,
    buildComposedMessageFormData,
    buildComposedMessageSignature,
    getStableSubmissionId,
    removeQueuedAttachment,
    isFileDrag,
    updateFileDragDepth,
    validateFilesForQueue,
    type QueuedChatAttachment,
} from "./chat-attachment-queue";

const chatRoomSource = readFileSync(new URL("./chat-room.tsx", import.meta.url), "utf8");

const file = (name: string, size: number) => new File([new Uint8Array(size)], name, { type: "text/plain" });

test("queue validation accepts multiple files within backend limits", () => {
    const selected = [file("one.txt", 10), file("two.txt", 20)];
    assert.deepEqual(validateFilesForQueue([], selected), { accepted: selected });
});

test("dropping one or multiple files appends them to the same local queue", () => {
    const selected = [file("one.txt", 10), file("two.txt", 20)];
    const result = appendFilesToQueue(
        [],
        selected,
        (() => {
            let id = 0;
            return () => `drop-${++id}`;
        })(),
        () => "blob:preview",
    );
    assert.deepEqual(
        result.attachments.map((attachment) => attachment.file),
        selected,
    );
    assert.deepEqual(
        result.attachments.map((attachment) => attachment.id),
        ["drop-1", "drop-2"],
    );
    assert.equal(
        result.attachments.every((attachment) => !attachment.previewUrl),
        true,
    );
});

test("dropped images receive a preview URL through the existing attachment queue", () => {
    const image = new File(["image"], "preview.png", { type: "image/png" });
    const result = appendFilesToQueue(
        [],
        [image],
        () => "image-id",
        () => "blob:preview-image",
    );
    assert.equal(result.attachments[0].previewUrl, "blob:preview-image");
});

test("dropped files use the existing limits and leave the queue unchanged on rejection", () => {
    const existing: QueuedChatAttachment[] = [{ id: "existing", file: file("existing.txt", 1) }];
    const result = appendFilesToQueue(
        existing,
        Array.from({ length: 10 }, (_, index) => file(`${index}.txt`, 1)),
        () => "unexpected",
        () => "blob:preview",
    );
    assert.match(result.error || "", /10/);
    assert.deepEqual(result.attachments, existing);
});

test("file drags are distinguished from text drags and nested depth returns to zero", () => {
    const fileTransfer = { types: ["Files"], items: [] } as unknown as DataTransfer;
    const fileItemTransfer = {
        types: ["text/uri-list"],
        items: [{ kind: "file" }],
    } as unknown as DataTransfer;
    const textTransfer = { types: ["text/plain"], items: [{ kind: "string" }] } as unknown as DataTransfer;
    assert.equal(isFileDrag(fileTransfer), true);
    assert.equal(isFileDrag(fileItemTransfer), true);
    assert.equal(isFileDrag(textTransfer), false);

    let depth = updateFileDragDepth(0, "enter");
    depth = updateFileDragDepth(depth, "enter");
    depth = updateFileDragDepth(depth, "leave");
    assert.equal(depth, 1);
    assert.equal(updateFileDragDepth(depth, "drop"), 0);
    assert.equal(updateFileDragDepth(0, "leave"), 0);
});

test("file drop queue handling is wired to the active topic reply composer", () => {
    assert.equal((chatRoomSource.match(/useChatFileDrop\(handleFilesDropped/g) || []).length, 1);
    assert.match(chatRoomSource, /topicFileDrop\.isFileDragActive/);
    assert.match(chatRoomSource, /enqueueChatFiles\(files, queuedAttachmentsRef, setQueuedAttachments, isSending\)/);
    assert.doesNotMatch(chatRoomSource, /fileDrop\.(?:isFileDragActive|onDrop)/);
    assert.doesNotMatch(chatRoomSource, /<ChatInput\b/);
    assert.match(chatRoomSource, /onDragOverCapture=\{preventFileDropNavigation\}/);
    assert.match(chatRoomSource, /onDropCapture=\{preventFileDropNavigation\}/);
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
