import assert from "node:assert/strict";
import test from "node:test";
import { getCircleModerationStarterAuthor } from "./moderation-presentation";

const realAuthor = { _id: "actor", did: "did:example:actor", name: "Real Admin" } as any;

test("marked lifecycle starters use Kamooni Admin presentation without changing identity", () => {
    const author = getCircleModerationStarterAuthor({
        conversationSource: "circle_moderation",
        messageSource: "circle_moderation",
        messageVersion: "v1",
        senderDid: realAuthor.did,
        realAuthor,
    });
    assert.equal(author?.name, "Kamooni Admin");
    assert.equal(author?.did, realAuthor.did);
    assert.equal(realAuthor.name, "Real Admin", "the stored author object remains unchanged");
});

test("quoted and reply-preview lifecycle starters use Kamooni Admin presentation", () => {
    for (const presentationPath of ["quote", "reply preview"]) {
        const author = getCircleModerationStarterAuthor({
            conversationSource: "circle_moderation",
            messageSource: "circle_moderation",
            messageVersion: "v1",
            senderDid: realAuthor.did,
            realAuthor,
        });
        assert.equal(author?.name, "Kamooni Admin", presentationPath);
    }
});

test("unmarked moderation topics and unrelated DMs retain their real authors", () => {
    assert.equal(
        getCircleModerationStarterAuthor({ conversationSource: "circle_moderation", senderDid: realAuthor.did, realAuthor }),
        realAuthor,
    );
    assert.equal(
        getCircleModerationStarterAuthor({
            conversationSource: "dm",
            messageSource: "circle_moderation",
            messageVersion: "v1",
            senderDid: realAuthor.did,
            realAuthor,
        }),
        realAuthor,
    );
    assert.equal(
        getCircleModerationStarterAuthor({
            conversationSource: "circle_moderation",
            messageSource: "circle_moderation",
            messageVersion: "v2",
            senderDid: realAuthor.did,
            realAuthor,
        }),
        realAuthor,
        "ordinary/manual moderation messages retain their real author",
    );
});
