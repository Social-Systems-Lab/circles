import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const sourceRoot = fileURLToPath(new URL("../..", import.meta.url));
const productionSources = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) return productionSources(path);
        return [".ts", ".tsx"].includes(extname(entry.name)) && !entry.name.endsWith(".test.ts") ? [path] : [];
    });
const callers = (pattern: RegExp) =>
    productionSources(sourceRoot)
        .filter((path) => pattern.test(readFileSync(path, "utf8")))
        .map((path) => relative(sourceRoot, path))
        .sort();

test("the browser action delegates exclusively through canonical delete orchestration", () => {
    const actions = read("../../components/modules/feeds/actions.ts");
    const start = actions.indexOf("export async function deleteCommentAction");
    const end = actions.indexOf("export async function likeContentAction", start);
    const source = actions.slice(start, end);
    assert.match(source, /orchestrateCommentDelete\(/);
    assert.match(source, /toCommentDeleteActionSuccess\(result\.disposition, result\.comment!\)/);
    assert.doesNotMatch(source, /getComment\(|getPost\(|getFeed\(|deleteComment\(/);
});

test("persistence uses exact child/reaction queries and protected counters", () => {
    const policy = read("./comment-delete-access-policy.ts");
    assert.match(policy, /findOne\(\{ parentCommentId: commentId \}, \{ projection: \{ _id: 1 \} \}\)/);
    assert.match(policy, /commentReactionCleanupFilter\(commentId\)/);
    assert.match(policy, /comments: \{ \$gt: 0 \}/);
    assert.match(policy, /replies: \{ \$gt: 0 \}/);
    assert.match(policy, /context\.route\.kind === "generic"/);
});

test("all browser clients branch on disposition and do not prune tombstone descendants", () => {
    for (const path of [
        "../../components/modules/feeds/post-list.tsx",
        "../../components/modules/feeds/CommentSection.tsx",
        "../../components/modules/discussions/discussion-list.tsx",
    ]) {
        const source = read(path);
        assert.match(source, /applyCommentDeleteDisposition/);
        assert.match(source, /result\.disposition/);
    }
    assert.match(read("../../components/modules/feeds/post-list.tsx"), /applyHighlightedCommentDeleteDisposition/);
    assert.match(read("../../components/modules/feeds/actions.ts"), /result\.disposition === "hard-delete"/);
    assert.match(
        read("../../components/modules/feeds/actions.ts"),
        /toCommentDeleteActionSuccess\(result\.disposition, result\.comment!\)/,
    );
    assert.doesNotMatch(read("../../components/modules/feeds/CommentSection.tsx"), /c\.parentCommentId !== commentId/);
});

test("fresh Event authorization and raw persistence remain behind the orchestration boundary", () => {
    const policy = read("./comment-delete-access-policy.ts");
    assert.match(policy, /findCurrentEvent/);
    assert.match(policy, /canReadCurrentEventHosts/);
    assert.match(policy, /assertEventHostsWritable/);
    for (const path of [
        "../../components/modules/feeds/post-list.tsx",
        "../../components/modules/feeds/CommentSection.tsx",
        "../../components/modules/discussions/discussion-list.tsx",
    ]) {
        const source = read(path);
        assert.doesNotMatch(source, /mongoCommentDeletePersistence|\.hardDelete\(|\.tombstone\(/);
    }
});

test("authorized tombstones return sanitized state before child routing", () => {
    const policy = read("./comment-delete-access-policy.ts");
    const authorized = policy.indexOf("await authorizeCommentDelete");
    const alreadyDeleted = policy.indexOf("context.comment.isDeleted === true", authorized);
    const childLookup = policy.indexOf("input.persistence.hasChild", authorized);
    assert.ok(authorized >= 0 && alreadyDeleted > authorized && childLookup > alreadyDeleted);
    assert.match(policy.slice(alreadyDeleted, childLookup), /sanitizedTombstone\(context\.comment\)/);

    const dto = read("./comment-dto.ts");
    assert.match(dto, /export type DeletedCommentDto = CommentDto & \{ mentions: \[\] \}/);
    assert.match(dto, /return \{ \.\.\.toCommentDto\(input\), mentions: \[\] \}/);
});

test("production low-level delete callers are limited to the authorized persistence path", () => {
    for (const pattern of [
        /\.hardDelete\(/,
        /\.tombstone\(/,
        /\.cleanupReactions\(/,
        /\.decrementPostComments\(/,
        /\.decrementParentReplies\(/,
    ]) {
        assert.deepEqual(callers(pattern), ["lib/data/comment-delete-access-policy.ts"]);
    }
    assert.deepEqual(callers(/mongoCommentDeletePersistence/), [
        "components/modules/feeds/actions.ts",
        "lib/data/comment-delete-access-policy.ts",
    ]);
});

test("browser-facing sources never invoke raw Comment delete persistence methods", () => {
    const browserSources = productionSources(sourceRoot).filter(
        (path) => path.includes("/components/") || path.includes("/app/"),
    );
    for (const path of browserSources) {
        const source = readFileSync(path, "utf8");
        assert.doesNotMatch(
            source,
            /\.hardDelete\(|\.tombstone\(|\.cleanupReactions\(|\.decrementPostComments\(|\.decrementParentReplies\(/,
            relative(sourceRoot, path),
        );
    }
});
