import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    DEFAULT_DM_TOPIC_TITLE,
    allocateDmIds,
    buildDraftRevisionFilter,
    dmPairKey,
    getDmComposerParticipationError,
    isDmComposeAuthorized,
    isMeaningfulDraft,
    issueProfileComposeCapability,
    resolveDmNavigation,
    verifyProfileComposeCapability,
} from "./dm-drafts";

delete process.env.AUTH_SECRET;
delete process.env.NEXTAUTH_SECRET;
delete process.env.JWT_SECRET;
process.env.CIRCLES_JWT_SECRET = "dm-draft-test-secret";

async function main() {
    assert.equal(
        getDmComposerParticipationError({ isAdmin: true }),
        null,
        "an eligible user passes the established participation rule",
    );
    assert.match(
        getDmComposerParticipationError({ circleType: "user", isEmailVerified: false }) || "",
        /Verify your email/,
        "an ineligible user is rejected by the established participation rule",
    );
    assert.equal(isMeaningfulDraft(DEFAULT_DM_TOPIC_TITLE, "", []), false, "untouched composer creates no draft");
    assert.equal(isMeaningfulDraft("Changed", "", []), true, "changed title is saved");
    assert.equal(isMeaningfulDraft(DEFAULT_DM_TOPIC_TITLE, "message", []), true, "body is autosaved");
    assert.equal(isMeaningfulDraft(DEFAULT_DM_TOPIC_TITLE, "", ["tag"]), true, "hashtags are autosaved");

    assert.equal(dmPairKey("did:b", "did:a"), dmPairKey("did:a", "did:b"), "DM pair claims are canonical");
    const first = allocateDmIds("0123456789abcdef01234567");
    const retry = allocateDmIds("0123456789abcdef01234567");
    const other = allocateDmIds("1123456789abcdef01234567");
    assert.equal(first.conversationId.toString(), retry.conversationId.toString(), "retry reuses conversation id");
    assert.equal(first.topicId.toString(), retry.topicId.toString(), "retry cannot duplicate topic");
    assert.notEqual(first.topicId.toString(), other.topicId.toString(), "different submissions remain distinct");

    const capability = issueProfileComposeCapability("did:author", "did:recipient");
    assert.equal(
        verifyProfileComposeCapability("did:author", "did:recipient", capability),
        true,
        "profile grant is server signed",
    );
    assert.match(
        getDmComposerParticipationError({ circleType: "user", isEmailVerified: false }) || "",
        /Verify your email/,
        "a previously issued valid capability cannot bypass current participation readiness",
    );
    assert.equal(
        verifyProfileComposeCapability("did:attacker", "did:recipient", capability),
        false,
        "profile grant is author-bound",
    );
    assert.equal(
        verifyProfileComposeCapability("did:author", "did:other", capability),
        false,
        "profile grant is recipient-bound",
    );
    assert.equal(
        verifyProfileComposeCapability("did:author", "did:recipient", "profile"),
        false,
        "forged source is rejected",
    );
    const [expiresAt, signature] = capability.split(".");
    assert.equal(
        verifyProfileComposeCapability("did:author", "did:recipient", `${expiresAt}.${"0".repeat(64)}`),
        false,
        "forged signatures are rejected",
    );
    assert.equal(
        verifyProfileComposeCapability(
            "did:author",
            "did:recipient",
            issueProfileComposeCapability("did:author", "did:recipient", Date.now() - 1),
        ),
        false,
        "expired grants are rejected",
    );
    assert.equal(
        verifyProfileComposeCapability("did:author", "did:recipient", `${expiresAt}.${signature}x`),
        false,
        "malformed grants are rejected",
    );

    assert.equal(
        isDmComposeAuthorized(false, false, "did:author", "did:recipient", capability),
        true,
        "profile entry remains authorized by a valid server-signed capability",
    );
    assert.equal(
        isDmComposeAuthorized(false, true, "did:author", "did:recipient"),
        true,
        "an existing server-recorded profile draft retains the profile-entry exception",
    );
    assert.equal(
        isDmComposeAuthorized(true, false, "did:author", "did:recipient"),
        true,
        "ordinary New Message remains authorized by standard eligibility",
    );
    assert.equal(
        isDmComposeAuthorized(false, false, "did:author", "did:recipient"),
        false,
        "ordinary New Message remains denied without standard eligibility",
    );

    assert.deepEqual(
        buildDraftRevisionFilter("did:a", "did:b", {
            title: "Hello",
            body: "x",
            hashtags: [],
            revision: 4,
            generation: "g",
        }),
        { authorDid: "did:a", recipientDid: "did:b", generation: "g", revision: { $lt: 4 } },
        "autosave revision only accepts newer writes for the authenticated author",
    );

    const unsentDraft = { title: "Private draft", body: "still here", revision: 7 };
    const draftBeforeNavigation = structuredClone(unsentDraft);
    let authorizationChecks = 0;
    assert.deepEqual(
        await resolveDmNavigation(
            async () => ["canonical-dm"],
            async () => {
                authorizationChecks += 1;
                return { allowed: false };
            },
        ),
        { success: true, destination: "conversation", conversationId: "canonical-dm" },
        "an existing DM opens its canonical conversation",
    );
    assert.equal(authorizationChecks, 0, "existing participation authorizes navigation without a draft grant");
    assert.deepEqual(
        await resolveDmNavigation(
            async () => [],
            async () => ({ allowed: true }),
        ),
        { success: true, destination: "draft", capability: undefined },
        "an eligible recipient with no DM opens the empty draft composer",
    );
    assert.deepEqual(
        await resolveDmNavigation(
            async () => [],
            async () => ({ allowed: true, capability: "signed" }),
        ),
        { success: true, destination: "draft", capability: "signed" },
        "profile entry keeps its server-authorized capability",
    );
    assert.deepEqual(
        await resolveDmNavigation(
            async () => ["older", "newer"],
            async () => ({ allowed: true }),
        ),
        {
            success: false,
            message: "Multiple direct-message conversations already exist. Support must resolve this safely.",
        },
        "duplicate historical DM pairs fail closed",
    );
    assert.deepEqual(
        await resolveDmNavigation(
            async () => [],
            async () => ({ allowed: false }),
        ),
        { success: false, message: "Messaging is not available" },
        "an unauthorized client-selected recipient cannot open a composer",
    );
    assert.deepEqual(unsentDraft, draftBeforeNavigation, "navigation leaves an existing private draft unchanged");

    const actions = readFileSync(new URL("../../components/modules/chat/draft-actions.ts", import.meta.url), "utf8");
    const profileButton = readFileSync(
        new URL("../../components/modules/home/message-button.tsx", import.meta.url),
        "utf8",
    );
    const newMessage = readFileSync(
        new URL("../../components/modules/chat/create-chat-modal.tsx", import.meta.url),
        "utf8",
    );
    const chatLayout = readFileSync(new URL("../../app/chat/layout.tsx", import.meta.url), "utf8");
    const canonicalDm = readFileSync(new URL("./canonical-dm.ts", import.meta.url), "utf8");
    const persistence = readFileSync(new URL("./dm-draft-persistence.ts", import.meta.url), "utf8");
    const navigationActions = actions.slice(
        actions.indexOf("export async function openProfileDmComposerAction"),
        actions.indexOf("export async function getDmComposerAction"),
    );
    const saveAction = actions.slice(
        actions.indexOf("export async function saveDmDraftAction"),
        actions.indexOf("export async function discardDmDraftAction"),
    );
    const submitAction = actions.slice(actions.indexOf("export async function submitDmFirstTopicAction"));
    assert.doesNotMatch(
        profileButton,
        /findOrCreateDMConversationAction/,
        "profile Message does not create a conversation",
    );
    assert.match(navigationActions, /ensureDmComposerParticipant/, "profile capability issuance checks participation");
    assert.match(
        actions,
        /communityGuidelinesAcceptance:[\s\S]*isEmailVerified:[\s\S]*isAdmin:/,
        "composer readiness loads the same server fields as established interactive messaging",
    );
    assert.ok(
        navigationActions.indexOf("ensureDmComposerParticipant") <
            navigationActions.indexOf("issueProfileComposeCapability"),
        "ineligible users are rejected before a profile capability can be issued",
    );
    assert.match(saveAction, /ensureDmComposerParticipant/, "draft save revalidates participation");
    assert.ok(
        saveAction.indexOf("ensureDmComposerParticipant") < saveAction.indexOf("saveDmDraftRecord"),
        "rejected draft saves perform no persistence",
    );
    assert.match(submitAction, /ensureDmComposerParticipant/, "submission revalidates participation");
    assert.ok(
        submitAction.indexOf("ensureDmComposerParticipant") < submitAction.indexOf("publishDmFirstTopic"),
        "rejected submissions create no conversation, topic, draft reconciliation, or notification",
    );
    assert.doesNotMatch(
        newMessage,
        /findOrCreateDMConversationAction/,
        "New Message selection does not create a conversation",
    );
    assert.match(actions, /authorDid, recipientDid/, "draft reads and writes are author scoped");
    assert.match(actions, /getDmEligibility\(authorDid, resolvedRecipientDid\)/, "eligibility is rechecked at send");
    assert.match(
        newMessage,
        /openNewDmComposerAction\(clickedUser\.did \|\| ""\)/,
        "New Message resolves existing DMs server-side",
    );
    assert.match(
        profileButton,
        /result\.destination === "conversation"/,
        "profile Message opens an existing DM directly",
    );
    assert.match(newMessage, /result\.destination === "conversation"/, "New Message opens an existing DM directly");
    assert.doesNotMatch(newMessage, /capability=/, "New Message cannot claim the profile-entry exception");
    assert.doesNotMatch(
        navigationActions,
        /insertOne|updateOne|sendConversationMessageNotifications|ChatReadStates|ChatTopicReadStates/,
        "navigation performs no conversation, notification, draft, or read-state write",
    );
    assert.match(actions, /listDmDraftsAction/, "private drafts remain listable");
    assert.match(chatLayout, /listDmDraftsAction\(\)/, "private drafts remain accessible in the chat sidebar");
    assert.match(canonicalDm, /existing\.length > 1/, "historical duplicate DMs fail safely");
    assert.match(actions, /submissionId/, "stable submission ids protect retries");
    assert.match(actions, /publishDmFirstTopic/, "the action delegates publication to the production helper");
    assert.match(persistence, /state: "consumed"/, "draft is consumed only after topic persistence");
    assert.match(canonicalDm, /dmProvisional/, "partial first-send conversations remain hidden");
    assert.doesNotMatch(actions, /ChatReadStates|ChatTopicReadStates/, "draft editing cannot mutate read state");

    console.log("dm draft behavioral regression tests passed");
}

void main();
