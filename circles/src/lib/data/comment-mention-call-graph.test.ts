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

assert.doesNotMatch(feed, /highlightedComment\.mentions|mentionsDetails/);
assert.doesNotMatch(feed, /mentions:\s*"\$highlightedComment\.mentions"|mentionsDisplay:\s*\{/);
assert.equal((feed.match(/sanitizeHighlightedCommentsOnPosts\(sanitizedPosts, userDid\)/g) ?? []).length, 5);

function extractExportedFunction(startDeclaration: string, nextDeclaration: string): string {
    const start = feed.indexOf(startDeclaration);
    const end = feed.indexOf(nextDeclaration, start + startDeclaration.length);
    assert.notEqual(start, -1, `missing exact declaration: ${startDeclaration}`);
    assert.ok(end > start, `missing boundary after: ${startDeclaration}`);
    return feed.slice(start, end);
}

function assertSanitizerOrder(source: string, filterMarker: string, postSanitizerMarker: string): void {
    const filterIndex = source.indexOf(filterMarker);
    const postSanitizerIndex = source.indexOf(postSanitizerMarker, filterIndex);
    const highlightSanitizerIndex = source.indexOf(
        "sanitizeHighlightedCommentsOnPosts(sanitizedPosts, userDid)",
        postSanitizerIndex,
    );
    assert.ok(filterIndex >= 0, `missing filtering/access marker: ${filterMarker}`);
    assert.ok(postSanitizerIndex >= 0, `missing Post sanitizer after: ${filterMarker}`);
    assert.ok(highlightSanitizerIndex >= 0, `missing highlighted sanitizer after: ${postSanitizerMarker}`);
    assert.ok(filterIndex < postSanitizerIndex, `filtering must precede Post sanitation: ${filterMarker}`);
    assert.ok(
        postSanitizerIndex < highlightSanitizerIndex,
        `Post sanitation must precede highlighted sanitation: ${postSanitizerMarker}`,
    );
}

const fullPostSource = extractExportedFunction(
    "export const getFullPost = async (",
    "export const updateHighlightedComment = async (",
);
const multiFeedSource = extractExportedFunction(
    "export async function getPostsFromMultipleFeeds(",
    "export async function getPostsFromMultipleFeedsWithMetrics(",
);
const singleFeedSource = extractExportedFunction("export const getPosts = async (", "export const updatePost = async (");

assert.ok(fullPostSource.startsWith("export const getFullPost = async ("));
assert.ok(multiFeedSource.startsWith("export async function getPostsFromMultipleFeeds("));
assert.ok(singleFeedSource.startsWith("export const getPosts = async ("));
assert.notEqual(fullPostSource, multiFeedSource);
assert.notEqual(fullPostSource, singleFeedSource);
assert.notEqual(multiFeedSource, singleFeedSource);
assert.doesNotMatch(singleFeedSource, /getPostsFromMultipleFeeds/);

const fullAccessIndex = fullPostSource.indexOf("resolveReadablePostContext(postId, userDid)");
const fullPostSanitizerIndex = fullPostSource.indexOf("sanitizePostNestedContent(posts, userDid)");
const fullHighlightSanitizerIndex = fullPostSource.indexOf("sanitizeHighlightedCommentsOnPosts(sanitizedPosts, userDid)");
assert.ok(fullAccessIndex >= 0);
assert.ok(fullPostSanitizerIndex >= 0);
assert.ok(fullHighlightSanitizerIndex >= 0);
assert.ok(fullAccessIndex < fullPostSanitizerIndex);
assert.ok(fullPostSanitizerIndex < fullHighlightSanitizerIndex);

assertSanitizerOrder(
    multiFeedSource,
    "const filteredPosts = posts.filter(",
    "sanitizePostNestedContent(filteredPosts, userDid)",
);
assertSanitizerOrder(
    multiFeedSource,
    "const publicPosts = posts.filter(",
    "sanitizePostNestedContent(publicPosts, userDid)",
);
assertSanitizerOrder(
    singleFeedSource,
    "const filteredPosts = posts.filter(",
    "sanitizePostNestedContent(filteredPosts, userDid)",
);
assertSanitizerOrder(
    singleFeedSource,
    "const publicPostsForFeed = posts.filter(",
    "sanitizePostNestedContent(publicPostsForFeed, userDid)",
);

for (const source of [fullPostSource, multiFeedSource, singleFeedSource]) {
    assert.doesNotMatch(source, /highlightedComment\.mentions|mentionsDetails/);
    assert.doesNotMatch(source, /mentions:\s*"\$highlightedComment\.mentions"|mentionsDisplay:\s*\{/);
    assert.match(source, /authorDetails/);
    assert.match(source, /userReaction/);
}

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
