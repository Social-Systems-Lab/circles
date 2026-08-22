import assert from "node:assert/strict";
import type { CommentDisplay } from "@/models/models";
import { replaceCommentWithServerResult } from "./comment-list-state";

const comment = (id: string, content: string) => ({ _id: id, content }) as CommentDisplay;
const original = [comment("root", "old root"), comment("reply", "old reply")];
const sanitized = comment("reply", "Unavailable Circle");
const replaced = replaceCommentWithServerResult(original, sanitized);

assert.equal(replaced[0], original[0]);
assert.equal(replaced[1], sanitized);
assert.equal(replaced[1].content, "Unavailable Circle");
assert.equal(original[1].content, "old reply", "optimistic input is not mutated");
console.log("comment list state tests passed");
