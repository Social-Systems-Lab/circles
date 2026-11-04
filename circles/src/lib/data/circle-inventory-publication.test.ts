import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { canViewUnpublishedInventoryCircle } from "./circle-discovery-queries";

const run = async () => {
    const draftCreatorId = new ObjectId();
    const draftMemberId = new ObjectId();

    assert.equal(
        await canViewUnpublishedInventoryCircle(
            { _id: draftCreatorId, createdBy: "did:owner" },
            "did:owner",
            async () => false,
        ),
        true,
        "a creator can see their unpublished inventory circle",
    );
    assert.equal(
        await canViewUnpublishedInventoryCircle({ _id: draftMemberId }, "did:editor", async () => true),
        true,
        "an authorized editor can see an unpublished inventory circle",
    );
    assert.equal(
        await canViewUnpublishedInventoryCircle({ _id: draftMemberId }, "did:ordinary-member", async () => false),
        false,
        "ordinary membership alone does not expose an unpublished inventory circle",
    );
    assert.equal(
        await canViewUnpublishedInventoryCircle({ _id: draftMemberId }, undefined, async () => true),
        false,
        "an anonymous viewer cannot see an unpublished inventory circle",
    );
};

void run();
