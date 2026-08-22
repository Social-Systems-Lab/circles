import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const feed = readFileSync("src/lib/data/feed.ts", "utf8");
const actions = readFileSync("src/components/modules/feeds/actions.ts", "utf8");
const clients = [
    readFileSync("src/components/modules/feeds/post-list.tsx", "utf8"),
    readFileSync("src/components/modules/discussions/discussion-list.tsx", "utf8"),
    readFileSync("src/components/modules/feeds/CommentSection.tsx", "utf8"),
];

const normalComments = feed.slice(
    feed.indexOf("export const getAllComments"),
    feed.indexOf("export const getPostsForEmbedding"),
);
assert.doesNotMatch(normalComments, /mentionsDetails|mentionsDisplay|mentions:\s*1/);
assert.match(normalComments, /authorDetails/);
assert.match(normalComments, /userReaction/);
assert.match(normalComments, /rootParentId/);

const highlightedSection = feed.slice(
    feed.indexOf("export const getFullPost"),
    feed.indexOf("export const updateHighlightedComment"),
);
assert.match(
    highlightedSection,
    /highlightedComment[\s\S]*mentionsDetails/,
    "highlighted-comment hydration remains deferred to c2b",
);

const createStart = actions.indexOf("export async function createCommentAction");
const editStart = actions.indexOf("export async function editCommentAction");
const createSource = actions.slice(createStart, editStart);
const editSource = actions.slice(editStart, actions.indexOf("export async function deleteCommentAction"));
assert.ok(createSource.lastIndexOf("notifyCommentMentions") < createSource.lastIndexOf("sanitizeCommentMentions"));
assert.match(createSource, /comment:\s*sanitizedComment/);
assert.match(editSource, /sanitizeCommentMentions/);
assert.match(editSource, /comment:\s*sanitizedComment/);

for (const client of clients) {
    assert.match(client, /replaceCommentWithServerResult/);
    assert.match(client, /result\.comment/);
}

console.log("comment mention call graph tests passed");
