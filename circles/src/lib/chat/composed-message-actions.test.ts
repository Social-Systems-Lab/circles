import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import { runWithChatActionContext, type ChatActionContext } from "./chat-action-context";

process.env.IS_BUILD = "true";
const {
    sendComposedMessageAction,
}: typeof import("@/components/modules/chat/mongo-actions") = require("@/components/modules/chat/mongo-actions");

const viewerDid = "did:composer";
const conversationId = new ObjectId().toHexString();
const circleId = new ObjectId().toHexString();
const replyId = new ObjectId().toHexString();

const form = ({
    body = "Hello",
    files = [],
    threadId,
    submissionId = "submission-123",
}: {
    body?: string;
    files?: File[];
    threadId?: string;
    submissionId?: string;
} = {}) => {
    const data = new FormData();
    data.set("roomId", conversationId);
    if (body) data.set("body", body);
    if (threadId) data.set("threadId", threadId);
    if (submissionId) data.set("submissionId", submissionId);
    for (const file of files) data.append("files", file);
    return data;
};

const baseContext = (overrides: Partial<ChatActionContext> = {}): ChatActionContext => ({
    viewerDid,
    findMessagingUser: async () => ({
        did: viewerDid,
        circleType: "user",
        picture: { url: "/profile.png" },
        description: "Complete profile",
        isAdmin: true,
        isEmailVerified: true,
    }),
    findConversation: async () => ({
        _id: new ObjectId(conversationId),
        type: "group",
        circleId,
        participants: [viewerDid],
    }),
    findCircle: async () => ({ _id: circleId, circleType: "circle", moderationStatus: "active" }),
    findCanonicalMember: async () => ({ userDid: viewerDid, circleId }),
    findChatMember: async () => ({ userDid: viewerDid, chatRoomId: conversationId, status: "active" }),
    findMessageBySubmissionId: async () => null,
    findThreadStarter: async (threadId, requestedConversationId) => ({
        _id: threadId,
        conversationId: requestedConversationId,
        thread: { title: "Topic" },
    }),
    refreshMessageActivity: async () => undefined,
    notifyMessage: async () => undefined,
    ...overrides,
});

test("composed message uploads files sequentially and persists one text-plus-attachments message", async () => {
    const order: string[] = [];
    let persisted: any;
    const files = [
        new File(["one"], "one.png", { type: "image/png" }),
        new File(["two"], "two.pdf", { type: "application/pdf" }),
    ];
    const result = await runWithChatActionContext(
        baseContext({
            saveFile: async (file: File) => {
                order.push(file.name);
                return { url: `/storage/${file.name}`, fileName: `key-${file.name}`, originalName: file.name };
            },
            createMessage: async (input) => {
                persisted = input;
                return { ...input, _id: "message-1" };
            },
        }),
        () => sendComposedMessageAction(form({ files })),
    );

    assert.equal(result.success, true);
    assert.equal(result.messageId, "message-1");
    assert.deepEqual(order, ["one.png", "two.pdf"]);
    assert.equal(persisted.body, "Hello");
    assert.equal(persisted.attachments.length, 2);
    assert.deepEqual(
        persisted.attachments.map((item: any) => item.name),
        ["one.png", "two.pdf"],
    );
});

test("attachment-only composed message uses the first filename and preserves reply target", async () => {
    let persisted: any;
    const data = form({ body: "", files: [new File(["x"], "fallback.txt", { type: "text/plain" })] });
    data.set("replyToMessageId", replyId);
    const result = await runWithChatActionContext(
        baseContext({
            findMessage: async () => ({ _id: replyId, conversationId }),
            saveFile: async (file: File) => ({
                url: `/storage/${file.name}`,
                fileName: file.name,
                originalName: file.name,
            }),
            createMessage: async (input) => {
                persisted = input;
                return { ...input, _id: "message-2" };
            },
        }),
        () => sendComposedMessageAction(data),
    );
    assert.equal(result.success, true);
    assert.equal(persisted.body, "fallback.txt");
    assert.equal(persisted.replyToMessageId, replyId);
});

test("topic composed message preserves thread, reply target, attachments and submission id", async () => {
    const threadId = new ObjectId().toHexString();
    let call: any;
    const data = form({ files: [new File(["x"], "topic.txt")], threadId, submissionId: "topic-submission-1" });
    data.set("replyToMessageId", replyId);
    const result = await runWithChatActionContext(
        baseContext({
            findMessage: async () => ({ _id: replyId, conversationId }),
            saveFile: async (file: File) => ({
                url: `/storage/${file.name}`,
                fileName: file.name,
                originalName: file.name,
            }),
            createThreadReply: async (...args) => {
                call = args;
                return { ...args[3], _id: "topic-reply-1", createdAt: new Date() };
            },
        }),
        () => sendComposedMessageAction(data),
    );
    assert.equal(result.success, true);
    assert.deepEqual(call.slice(0, 3), [threadId, conversationId, viewerDid]);
    assert.equal(call[3].replyToMessageId, replyId);
    assert.equal(call[3].submissionId, "topic-submission-1");
    assert.equal(call[3].attachments.length, 1);
});

test("authorization denial happens before upload", async () => {
    let uploads = 0;
    const result = await runWithChatActionContext(
        baseContext({
            findCanonicalMember: async () => null,
            findChatMember: async () => null,
            saveFile: async () => {
                uploads++;
                throw new Error("must not upload");
            },
        }),
        () => sendComposedMessageAction(form({ files: [new File(["x"], "denied.txt")] })),
    );
    assert.equal(result.success, false);
    assert.equal(uploads, 0);
});

test("invalid and foreign topics are rejected before any upload", async () => {
    for (const topicResult of [null, { _id: new ObjectId(), conversationId: new ObjectId().toHexString() }]) {
        let uploads = 0;
        const result = await runWithChatActionContext(
            baseContext({
                findThreadStarter: async () => topicResult,
                saveFile: async () => {
                    uploads++;
                    return { url: "/storage/should-not-exist", fileName: "file" };
                },
            }),
            () =>
                sendComposedMessageAction(
                    form({ threadId: new ObjectId().toHexString(), files: [new File(["x"], "topic.txt")] }),
                ),
        );
        assert.equal(result.success, false);
        assert.equal(result.message, "Topic not found for this conversation");
        assert.equal(uploads, 0);
    }
});

test("persisted activity errors do not delete uploaded objects", async () => {
    const { PersistedChatMessageActivityError } = await import("@/lib/data/mongo-chat");
    const deleted: string[] = [];
    const result = await runWithChatActionContext(
        baseContext({
            saveFile: async () => ({ url: "/storage/persisted.txt", fileName: "persisted.txt" }),
            createMessage: async (input) => {
                throw new PersistedChatMessageActivityError({ ...input, _id: "persisted-message" }, new Error("update failed"));
            },
            deleteFile: async (url) => {
                deleted.push(url);
            },
        }),
        () => sendComposedMessageAction(form({ files: [new File(["x"], "persisted.txt")] })),
    );
    assert.equal(result.success, false);
    assert.match(result.message || "", /saved/);
    assert.deepEqual(deleted, []);
});

test("partial upload and persistence failures roll back every successful upload", async () => {
    for (const failure of ["upload", "persistence"] as const) {
        const deleted: string[] = [];
        let uploadCount = 0;
        const result = await runWithChatActionContext(
            baseContext({
                saveFile: async (file: File) => {
                    uploadCount++;
                    if (failure === "upload" && uploadCount === 2) throw new Error("upload failed");
                    return { url: `/storage/${file.name}`, fileName: file.name, originalName: file.name };
                },
                createMessage: async () => {
                    throw new Error("persistence failed");
                },
                deleteFile: async (url) => {
                    deleted.push(url);
                },
            }),
            () => sendComposedMessageAction(form({ files: [new File(["1"], "one.txt"), new File(["2"], "two.txt")] })),
        );
        assert.equal(result.success, false);
        assert.deepEqual(
            deleted,
            failure === "upload" ? ["/storage/one.txt"] : ["/storage/one.txt", "/storage/two.txt"],
        );
    }
});

test("notification failure does not turn a persisted message into a send failure", async () => {
    const result = await runWithChatActionContext(
        baseContext({
            createMessage: async (input) => ({ ...input, _id: "persisted-message" }),
            notifyMessage: async () => {
                throw new Error("notification unavailable");
            },
        }),
        () => sendComposedMessageAction(form()),
    );
    assert.equal(result.success, true);
    assert.equal(result.messageId, "persisted-message");
});

test("completed retry returns the original message without uploading or persisting again", async () => {
    let uploads = 0;
    let persists = 0;
    const createdAt = new Date();
    const result = await runWithChatActionContext(
        baseContext({
            findMessageBySubmissionId: async () => ({
                _id: "existing-message",
                conversationId,
                senderDid: viewerDid,
                body: "Hello",
                createdAt,
                submissionId: "submission-123",
            }),
            saveFile: async () => {
                uploads++;
                return {};
            },
            createMessage: async () => {
                persists++;
                return {};
            },
        }),
        () => sendComposedMessageAction(form({ files: [new File(["x"], "retry.txt")] })),
    );
    assert.equal(result.success, true);
    assert.equal(result.messageId, "existing-message");
    assert.equal(uploads, 0);
    assert.equal(persists, 0);
});

test("server validation enforces file shape, count, per-file size and combined size", async () => {
    const cases: Array<[FormData, string]> = [];
    const invalid = form();
    invalid.append("files", "not-a-file");
    cases.push([invalid, "Invalid attachment"]);
    cases.push([
        form({ files: Array.from({ length: 11 }, (_, index) => new File(["x"], `${index}.txt`)) }),
        "A message can include at most 10 attachments",
    ]);
    cases.push([
        form({ files: [new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.bin")] }),
        "File size exceeds 5MB limit",
    ]);
    cases.push([
        form({
            files: Array.from({ length: 6 }, (_, index) => new File([new Uint8Array(5 * 1024 * 1024)], `${index}.bin`)),
        }),
        "Combined attachment size exceeds 25MB limit",
    ]);

    for (const [data, expected] of cases) {
        const result = await runWithChatActionContext(baseContext(), () => sendComposedMessageAction(data));
        assert.equal(result.success, false);
        assert.equal(result.message, expected);
    }
});
