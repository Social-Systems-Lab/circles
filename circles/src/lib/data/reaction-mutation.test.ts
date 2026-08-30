import assert from "node:assert/strict";
import { applyLikeMutation, applyUnlikeMutation, type ReactionMutationInput } from "./reaction-mutation";

const input: ReactionMutationInput = {
    contentId: "64b000000000000000000001",
    contentType: "post",
    userDid: "did:actor",
    reactionType: "like",
};

async function main() {
    let exists = false;
    let inserts = 0;
    let deletes = 0;
    let counter = 0;
    let highlightedComment = 0;
    const dependencies = {
        findExisting: async () => exists,
        insert: async () => {
            exists = true;
            inserts++;
        },
        remove: async () => {
            if (!exists) return false;
            exists = false;
            deletes++;
            return true;
        },
        incrementCounter: async (_input: ReactionMutationInput, amount: 1 | -1) => {
            counter += amount;
        },
        refreshHighlightedComment: async () => void ++highlightedComment,
    };

    assert.equal(await applyLikeMutation(input, dependencies), true);
    assert.deepEqual({ inserts, counter, highlightedComment }, { inserts: 1, counter: 1, highlightedComment: 0 });
    assert.equal(await applyLikeMutation(input, dependencies), false);
    assert.deepEqual({ inserts, counter, highlightedComment }, { inserts: 1, counter: 1, highlightedComment: 0 });

    assert.equal(await applyUnlikeMutation(input, dependencies), true);
    assert.deepEqual({ deletes, counter, highlightedComment }, { deletes: 1, counter: 0, highlightedComment: 0 });
    assert.equal(await applyUnlikeMutation(input, dependencies), false);
    assert.deepEqual({ deletes, counter, highlightedComment }, { deletes: 1, counter: 0, highlightedComment: 0 });
    console.log("reaction mutation tests passed");
}

void main();
