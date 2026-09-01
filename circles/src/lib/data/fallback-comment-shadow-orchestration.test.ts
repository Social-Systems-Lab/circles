import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { Circle, Feed, Member, Post } from "@/models/models";
import { canReadCircle } from "./circle-visibility-policy";
import { features } from "./constants";
import {
    orchestrateFallbackCommentShadow,
    type FallbackCommentShadowDependencies,
    type FallbackCommentShadowType,
} from "./fallback-comment-shadow-orchestration";

const actorDid = "did:actor";
const creatorDid = "did:creator";

const moduleFor = (type: FallbackCommentShadowType) => (type === "proposal" ? "proposals" : `${type}s`);
const viewFeatureFor = (type: FallbackCommentShadowType) =>
    type === "task"
        ? features.tasks.view
        : type === "goal"
          ? features.goals.view
          : type === "issue"
            ? features.issues.view
            : features.proposals.view;
const commentFeatureFor = (type: FallbackCommentShadowType) =>
    type === "task"
        ? features.tasks.comment
        : type === "goal"
          ? features.goals.comment
          : type === "issue"
            ? features.issues.comment
            : features.feed.comment;

function harness(type: FallbackCommentShadowType, overrides: Record<string, any> = {}) {
    const sourceId = new ObjectId();
    const circleId = new ObjectId();
    const feedId = new ObjectId();
    const createdId = new ObjectId();
    const source: any = {
        _id: sourceId,
        circleId: circleId.toHexString(),
        createdBy: creatorDid,
        userGroups: type === "task" || type === "proposal" ? ["members"] : ["ignored-by-current-policy"],
        title: "Detail",
        name: "Detail",
        ...(overrides.source ?? {}),
    };
    const circle = {
        _id: circleId,
        circleType: "circle",
        visibility: "public",
        moderationStatus: "active",
        enabledModules: [moduleFor(type)],
        ...(overrides.circle ?? {}),
    } as Circle;
    const feed = {
        _id: feedId,
        circleId: circleId.toHexString(),
        handle: "default",
        ...(overrides.feed ?? {}),
    } as Feed;
    const posts = new Map<string, Post>();
    let currentSource: any = source;
    const effects = {
        sourceLoads: 0,
        circleReads: 0,
        creates: 0,
        links: 0,
        reloads: 0,
        postLookups: 0,
        referenceGuards: 0,
        deletes: [] as string[],
        authorizations: [] as string[],
        feedLookups: 0,
        membershipLoads: 0,
        cleanupFailures: [] as string[],
    };
    const membership = {
        userDid: actorDid,
        circleId: circleId.toHexString(),
        userGroups: overrides.actorGroups ?? ["members"],
    } as Member;
    const dependencies: FallbackCommentShadowDependencies = {
        loadSource: async () => {
            effects.sourceLoads++;
            return overrides.missingSource ? null : source;
        },
        reloadSource: async () => {
            effects.reloads++;
            return overrides.reloadMissing ? null : currentSource;
        },
        loadCircle: async () => {
            effects.circleReads++;
            return overrides.missingCircle ? null : circle;
        },
        canReadCircle: async (did, owner) =>
            canReadCircle(did, owner, {
                getMember: async () =>
                    overrides.secretMember === false
                        ? null
                        : ({ ...membership, userDid: did, circleId: String(owner._id) } as Member),
            }),
        isAuthorized: async (_did, _circleId, feature) => {
            effects.authorizations.push(`${feature.module}.${feature.handle}`);
            if (feature === viewFeatureFor(type)) return overrides.viewAuthorized !== false;
            assert.equal(feature, commentFeatureFor(type), `${type} uses its established Comment feature mapping`);
            return overrides.commentAuthorized !== false;
        },
        loadMembership: async () => {
            effects.membershipLoads++;
            return overrides.missingMembership ? null : membership;
        },
        findCanonicalFeed: async () => {
            effects.feedLookups++;
            return overrides.missingFeed ? null : feed;
        },
        loadPost: async (id) => {
            effects.postLookups++;
            return posts.get(id.toHexString()) ?? null;
        },
        loadFeed: async () => overrides.loadedFeed ?? feed,
        createShadow: async (input) => {
            effects.creates++;
            const post = { ...input, _id: overrides.createdId ?? createdId } as Post;
            if (post._id) posts.set(String(post._id), post);
            return post;
        },
        linkIfMissing: async (_sourceType, _id, postId) => {
            effects.links++;
            if (overrides.linkThrows) throw new Error("conditional link failed");
            if (overrides.linkWins === false) return false;
            currentSource = { ...source, commentPostId: postId };
            return true;
        },
        isCandidateReferenced: async (postId) => {
            effects.referenceGuards++;
            if (overrides.referenceGuardThrows) throw new Error("reference guard failed");
            return overrides.candidateReferenced === true || currentSource?.commentPostId === postId;
        },
        deleteCreatedShadow: async (postId) => {
            effects.deletes.push(postId);
            if (overrides.cleanupThrows) throw new Error("cleanup failed");
            posts.delete(postId);
        },
        reportCleanupFailure: (postId) => effects.cleanupFailures.push(postId),
    };
    return {
        sourceId,
        circleId,
        feedId,
        createdId,
        source,
        circle,
        feed,
        posts,
        effects,
        dependencies,
        setSource: (next: any) => (currentSource = next),
        getSource: () => currentSource,
    };
}

const run = async (
    type: FallbackCommentShadowType,
    fixture = harness(type),
    callerCircleId = fixture.circleId.toHexString(),
) =>
    orchestrateFallbackCommentShadow(
        type,
        fixture.sourceId.toHexString(),
        callerCircleId,
        actorDid,
        fixture.dependencies,
    );

const canonicalPost = (type: FallbackCommentShadowType, fixture: ReturnType<typeof harness>, id: string, extra = {}) =>
    ({
        _id: new ObjectId(id),
        feedId: fixture.feedId.toHexString(),
        createdBy: creatorDid,
        createdAt: new Date(),
        content: `${type}: legacy-compatible content`,
        postType: type,
        parentItemType: type,
        parentItemId: fixture.sourceId.toHexString(),
        userGroups: [],
        comments: 0,
        reactions: {},
        ...extra,
    }) as Post;

const assertNoMutation = (fixture: ReturnType<typeof harness>, label: string) => {
    assert.equal(fixture.effects.creates, 0, `${label}: createPost/vector-facing adapter not invoked`);
    assert.equal(fixture.effects.links, 0, `${label}: backlink not written`);
    assert.deepEqual(fixture.effects.deletes, [], `${label}: cleanup not invoked`);
};

const assertRecoveryEffects = (
    fixture: ReturnType<typeof harness>,
    expected: {
        reloads: number;
        postLookups: number;
        referenceGuards: number;
        deletes: string[];
    },
) => {
    assert.equal(fixture.effects.sourceLoads, 1);
    assert.equal(fixture.effects.circleReads, 1);
    assert.equal(fixture.effects.feedLookups, 1);
    assert.equal(fixture.effects.creates, 1);
    assert.equal(fixture.effects.links, 1);
    assert.equal(fixture.effects.reloads, expected.reloads);
    assert.equal(fixture.effects.postLookups, expected.postLookups);
    assert.equal(fixture.effects.referenceGuards, expected.referenceGuards);
    assert.deepEqual(fixture.effects.deletes, expected.deletes);
};

async function main() {
    const unauthenticated = harness("task");
    assert.equal(
        await orchestrateFallbackCommentShadow(
            "task",
            unauthenticated.sourceId.toHexString(),
            unauthenticated.circleId.toHexString(),
            "",
            unauthenticated.dependencies,
        ),
        null,
    );
    assertNoMutation(unauthenticated, "unauthenticated");

    for (const type of ["task", "goal", "issue", "proposal"] as const) {
        const success = harness(type);
        assert.equal(
            await run(type, success),
            success.createdId.toHexString(),
            `${type}: missing backlink creates/links`,
        );
        assert.equal(success.effects.creates, 1);
        assert.equal(success.effects.links, 1);
        assert.deepEqual(success.effects.deletes, []);

        const valid = harness(type);
        const validId = new ObjectId().toHexString();
        valid.source.commentPostId = validId;
        valid.posts.set(validId, canonicalPost(type, valid, validId));
        assert.equal(await run(type, valid), validId, `${type}: strict backlink reused`);
        assertNoMutation(valid, `${type}: existing backlink reuse`);

        const historical = harness(type);
        const historicalId = new ObjectId().toHexString();
        historical.source.commentPostId = historicalId;
        historical.posts.set(historicalId, {
            _id: new ObjectId(historicalId),
            feedId: historical.feedId.toHexString(),
            postType: type,
            parentItemType: type,
            parentItemId: historical.sourceId.toHexString(),
        } as Post);
        assert.equal(
            await run(type, historical),
            historicalId,
            `${type}: incidental historical creator/content/group/counter/reaction differences remain reusable`,
        );
        assertNoMutation(historical, `${type}: historical backlink reuse`);

        const cases: Array<[string, ReturnType<typeof harness>, string?, string?]> = [
            ["malformed source", harness(type), "bad"],
            ["missing source", harness(type, { missingSource: true })],
            ["caller Circle mismatch", harness(type), undefined, new ObjectId().toHexString()],
            ["malformed source.circleId", harness(type, { source: { circleId: "bad" } })],
            ["missing source.circleId", harness(type, { source: { circleId: undefined } })],
            ["loaded Circle identity mismatch", harness(type, { circle: { _id: new ObjectId() } })],
            ["missing Circle", harness(type, { missingCircle: true })],
            ["paused Circle", harness(type, { circle: { moderationStatus: "paused" } })],
            ["suspended Circle", harness(type, { circle: { moderationStatus: "suspended" } })],
            ["removed Circle", harness(type, { circle: { moderationStatus: "removed" } })],
            ["view denied", harness(type, { viewAuthorized: false })],
            ["module unavailable", harness(type, { circle: { enabledModules: [] } })],
            ["comment feature denied", harness(type, { commentAuthorized: false })],
            ["missing default Feed", harness(type, { missingFeed: true })],
            ["malformed Feed identity", harness(type, { feed: { _id: "bad" } })],
            ["cross-Circle Feed", harness(type, { feed: { circleId: new ObjectId().toHexString() } })],
        ];
        for (const [name, fixture, sourceId, callerId] of cases) {
            assert.equal(
                await orchestrateFallbackCommentShadow(
                    type,
                    sourceId ?? fixture.sourceId.toHexString(),
                    callerId ?? fixture.circleId.toHexString(),
                    actorDid,
                    fixture.dependencies,
                ),
                null,
                `${type}: ${name}`,
            );
            assertNoMutation(fixture, `${type}: ${name}`);
        }

        for (const role of ["outsider", "former member", "superadmin", "admin", "moderator"]) {
            const denied = harness(type, { circle: { visibility: "secret" }, secretMember: false });
            assert.equal(await run(type, denied), null, `${type}: Secret ${role} nonmember denied`);
            assertNoMutation(denied, `${type}: Secret ${role}`);
        }
        const secretMember = harness(type, { circle: { visibility: "secret" } });
        assert.equal(await run(type, secretMember), secretMember.createdId.toHexString(), `${type}: Secret member`);

        const forgedCases: Array<[string, Record<string, unknown>]> = [
            ["malformed Post ID", { backlink: "bad" }],
            ["missing Post", { missingPost: true }],
            ["wrong Feed", { post: { feedId: new ObjectId().toHexString() } }],
            ["Feed wrong Circle", { loadedFeed: { circleId: new ObjectId().toHexString() } }],
            ["wrong parent type", { post: { parentItemType: type === "task" ? "goal" : "task" } }],
            ["wrong parent ID", { post: { parentItemId: new ObjectId().toHexString() } }],
            ["wrong Post type", { post: { postType: "post" } }],
            ["sourceResourceId", { post: { sourceResourceId: new ObjectId().toHexString() } }],
            ["sourceResourceType", { post: { sourceResourceType: "funding" } }],
            ["internalPreviewId", { post: { internalPreviewId: new ObjectId().toHexString() } }],
            ["internalPreviewType", { post: { internalPreviewType: "funding" } }],
            ["empty internalPreviewId", { post: { internalPreviewId: "" } }],
            ["null internalPreviewType", { post: { internalPreviewType: null } }],
            [
                "both internalPreview markers",
                { post: { internalPreviewId: new ObjectId().toHexString(), internalPreviewType: "funding" } },
            ],
        ];
        for (const [name, spec] of forgedCases) {
            const fixture = harness(type, spec.loadedFeed ? { loadedFeed: spec.loadedFeed } : {});
            const backlink = (spec.backlink as string | undefined) ?? new ObjectId().toHexString();
            fixture.source.commentPostId = backlink;
            if (!spec.missingPost && ObjectId.isValid(backlink)) {
                fixture.posts.set(
                    backlink,
                    canonicalPost(type, fixture, backlink, (spec.post as object | undefined) ?? {}),
                );
            }
            assert.equal(await run(type, fixture), null, `${type}: forged ${name}`);
            assertNoMutation(fixture, `${type}: forged ${name}`);
        }
    }

    for (const type of ["task", "proposal"] as const) {
        for (const [name, userGroups] of [
            ["missing groups", undefined],
            ["empty groups", []],
            ["everyone", ["everyone"]],
            ["intersecting group", ["members"]],
        ] as const) {
            const allowed = harness(type, { source: { userGroups }, actorGroups: ["members"] });
            assert.equal(await run(type, allowed), allowed.createdId.toHexString(), `${type}: ${name} succeeds`);
            assert.equal(allowed.effects.sourceLoads, 1);
            assert.equal(allowed.effects.circleReads, 1);
            assert.equal(allowed.effects.authorizations.length, 2);
            assert.equal(allowed.effects.feedLookups, 1);
            assert.equal(allowed.effects.creates, 1);
            assert.equal(allowed.effects.links, 1);
            assert.equal(allowed.effects.reloads, 0);
            assert.equal(allowed.effects.referenceGuards, 0);
            assert.deepEqual(allowed.effects.deletes, []);
        }
        const excluded = harness(type, { actorGroups: ["other"] });
        assert.equal(await run(type, excluded), null, `${type}: excluded group denied`);
        assertNoMutation(excluded, `${type}: excluded group`);
        assert.equal(excluded.effects.sourceLoads, 1);
        assert.equal(excluded.effects.circleReads, 1);
        assert.equal(excluded.effects.authorizations.length, 1);
        assert.equal(excluded.effects.membershipLoads, 1);
        assert.equal(excluded.effects.feedLookups, 0, `${type}: source denial precedes Feed lookup`);
        assert.equal(excluded.effects.reloads, 0);
        assert.equal(excluded.effects.postLookups, 0);
        assert.equal(excluded.effects.referenceGuards, 0);
        const secretExcluded = harness(type, { circle: { visibility: "secret" }, actorGroups: ["other"] });
        assert.equal(await run(type, secretExcluded), null, `${type}: Secret member excluded by source groups`);
        assertNoMutation(secretExcluded, `${type}: Secret source exclusion`);
        assert.equal(secretExcluded.effects.sourceLoads, 1);
        assert.equal(secretExcluded.effects.circleReads, 1);
        assert.equal(secretExcluded.effects.authorizations.length, 1);
        assert.equal(secretExcluded.effects.membershipLoads, 1);
        assert.equal(secretExcluded.effects.feedLookups, 0);
        assert.equal(secretExcluded.effects.reloads, 0);
        assert.equal(secretExcluded.effects.postLookups, 0);
        assert.equal(secretExcluded.effects.referenceGuards, 0);
    }
    for (const type of ["goal", "issue"] as const) {
        const currentPolicy = harness(type, { actorGroups: ["other"] });
        assert.equal(
            await run(type, currentPolicy),
            currentPolicy.createdId.toHexString(),
            `${type}: current detail policy does not invent user-group filtering`,
        );
    }

    const cleanupFailure = harness("task", { linkWins: false, cleanupThrows: true });
    const winnerId = new ObjectId().toHexString();
    cleanupFailure.posts.set(winnerId, canonicalPost("task", cleanupFailure, winnerId));
    cleanupFailure.setSource({ ...cleanupFailure.source, commentPostId: winnerId });
    assert.equal(await run("task", cleanupFailure), winnerId, "valid winner survives loser cleanup failure");
    assert.equal(cleanupFailure.getSource().commentPostId, winnerId);
    assert.deepEqual(cleanupFailure.effects.deletes, [cleanupFailure.createdId.toHexString()]);
    assert.deepEqual(cleanupFailure.effects.cleanupFailures, [cleanupFailure.createdId.toHexString()]);
    assert.equal(cleanupFailure.posts.has(cleanupFailure.createdId.toHexString()), true, "residual loser may remain");
    assertRecoveryEffects(cleanupFailure, {
        reloads: 1,
        postLookups: 1,
        referenceGuards: 1,
        deletes: [cleanupFailure.createdId.toHexString()],
    });

    const crossCircleWinner = harness("task", { linkWins: false });
    const crossCircleWinnerId = new ObjectId().toHexString();
    crossCircleWinner.posts.set(
        crossCircleWinnerId,
        canonicalPost("task", crossCircleWinner, crossCircleWinnerId, { feedId: new ObjectId().toHexString() }),
    );
    crossCircleWinner.setSource({ ...crossCircleWinner.source, commentPostId: crossCircleWinnerId });
    assert.equal(await run("task", crossCircleWinner), null, "cross-Circle race winner is rejected");
    assert.equal(crossCircleWinner.getSource().commentPostId, crossCircleWinnerId, "loser never overwrites winner");
    assert.equal(crossCircleWinner.posts.has(crossCircleWinnerId), true, "concurrent winner is untouched");
    assert.equal(crossCircleWinner.posts.has(crossCircleWinner.createdId.toHexString()), false, "local loser is removed");
    assertRecoveryEffects(crossCircleWinner, {
        reloads: 1,
        postLookups: 1,
        referenceGuards: 1,
        deletes: [crossCircleWinner.createdId.toHexString()],
    });

    const ambiguousWrite = harness("task");
    ambiguousWrite.dependencies.linkIfMissing = async (_type, _sourceId, postId) => {
        ambiguousWrite.effects.links++;
        ambiguousWrite.setSource({ ...ambiguousWrite.source, commentPostId: postId });
        throw new Error("write result lost after persistence");
    };
    assert.equal(await run("task", ambiguousWrite), null, "ambiguous write remains neutral");
    assert.equal(ambiguousWrite.getSource().commentPostId, ambiguousWrite.createdId.toHexString());
    assert.equal(ambiguousWrite.posts.has(ambiguousWrite.createdId.toHexString()), true, "referenced candidate retained");
    assertRecoveryEffects(ambiguousWrite, { reloads: 0, postLookups: 0, referenceGuards: 1, deletes: [] });

    const guardFailureWithWinner = harness("task", { linkWins: false, referenceGuardThrows: true });
    const guardWinnerId = new ObjectId().toHexString();
    guardFailureWithWinner.posts.set(guardWinnerId, canonicalPost("task", guardFailureWithWinner, guardWinnerId));
    guardFailureWithWinner.setSource({ ...guardFailureWithWinner.source, commentPostId: guardWinnerId });
    assert.equal(await run("task", guardFailureWithWinner), guardWinnerId, "valid winner survives reference-guard failure");
    assert.equal(guardFailureWithWinner.getSource().commentPostId, guardWinnerId);
    assert.equal(guardFailureWithWinner.posts.has(guardFailureWithWinner.createdId.toHexString()), true);
    assert.deepEqual(guardFailureWithWinner.effects.cleanupFailures, [guardFailureWithWinner.createdId.toHexString()]);
    assertRecoveryEffects(guardFailureWithWinner, {
        reloads: 1,
        postLookups: 1,
        referenceGuards: 1,
        deletes: [],
    });

    const referencedLoser = harness("task", { linkWins: false, candidateReferenced: true });
    referencedLoser.setSource(null);
    assert.equal(await run("task", referencedLoser), null);
    assert.deepEqual(referencedLoser.effects.deletes, [], "referenced candidate is never deleted");

    const disappeared = harness("task", { linkWins: false, reloadMissing: true });
    assert.equal(await run("task", disappeared), null, "source disappearance is not a winner");
    assert.deepEqual(disappeared.effects.deletes, [disappeared.createdId.toHexString()]);

    const disappearedCleanupFailure = harness("task", {
        linkWins: false,
        reloadMissing: true,
        cleanupThrows: true,
    });
    assert.equal(await run("task", disappearedCleanupFailure), null, "cleanup failure cannot fabricate a disappeared winner");
    assert.equal(disappearedCleanupFailure.getSource().commentPostId, undefined);
    assert.equal(disappearedCleanupFailure.posts.has(disappearedCleanupFailure.createdId.toHexString()), true);
    assert.deepEqual(disappearedCleanupFailure.effects.cleanupFailures, [disappearedCleanupFailure.createdId.toHexString()]);
    assertRecoveryEffects(disappearedCleanupFailure, {
        reloads: 1,
        postLookups: 0,
        referenceGuards: 1,
        deletes: [disappearedCleanupFailure.createdId.toHexString()],
    });

    for (const winner of ["bad", new ObjectId().toHexString()]) {
        const malformedWinner = harness("task", { linkWins: false });
        malformedWinner.setSource({ ...malformedWinner.source, commentPostId: winner });
        assert.equal(await run("task", malformedWinner), null, "malformed/missing winner fails closed");
        assert.equal(malformedWinner.getSource().commentPostId, winner, "malformed winner is not overwritten");
        assert.deepEqual(malformedWinner.effects.deletes, [malformedWinner.createdId.toHexString()]);
    }

    const malformedCleanupFailure = harness("task", { linkWins: false, cleanupThrows: true });
    malformedCleanupFailure.setSource({ ...malformedCleanupFailure.source, commentPostId: "bad" });
    assert.equal(await run("task", malformedCleanupFailure), null, "cleanup failure cannot validate malformed winner");
    assert.equal(malformedCleanupFailure.getSource().commentPostId, "bad");
    assert.equal(malformedCleanupFailure.posts.has(malformedCleanupFailure.createdId.toHexString()), true);
    assert.deepEqual(malformedCleanupFailure.effects.cleanupFailures, [malformedCleanupFailure.createdId.toHexString()]);
    assertRecoveryEffects(malformedCleanupFailure, {
        reloads: 1,
        postLookups: 0,
        referenceGuards: 1,
        deletes: [malformedCleanupFailure.createdId.toHexString()],
    });

    const writeFailure = harness("task", { linkThrows: true });
    assert.equal(await run("task", writeFailure), null, "conditional write failure is not a race winner");
    assert.deepEqual(writeFailure.effects.deletes, [writeFailure.createdId.toHexString()]);

    const writeCleanupFailure = harness("task", { linkThrows: true, cleanupThrows: true });
    assert.equal(await run("task", writeCleanupFailure), null, "cleanup failure cannot fabricate write success");
    assert.equal(writeCleanupFailure.getSource().commentPostId, undefined);
    assert.equal(writeCleanupFailure.posts.has(writeCleanupFailure.createdId.toHexString()), true);
    assert.deepEqual(writeCleanupFailure.effects.cleanupFailures, [writeCleanupFailure.createdId.toHexString()]);
    assertRecoveryEffects(writeCleanupFailure, {
        reloads: 0,
        postLookups: 0,
        referenceGuards: 1,
        deletes: [writeCleanupFailure.createdId.toHexString()],
    });

    await deterministicTwoAttemptRace();
    console.log("fallback Comment shadow orchestration tests passed");
}

async function deterministicTwoAttemptRace() {
    const fixture = harness("task");
    const candidateA = new ObjectId().toHexString();
    const candidateB = new ObjectId().toHexString();
    const created: string[] = [];
    const deleted: string[] = [];
    let linkAttempts = 0;
    let linkWins = 0;
    let source = { ...fixture.source, commentPostId: undefined };
    let releaseBoth!: () => void;
    const bothCreated = new Promise<void>((resolve) => (releaseBoth = resolve));
    let releaseA!: () => void;
    const aLinked = new Promise<void>((resolve) => (releaseA = resolve));
    const posts = new Map<string, Post>();
    const dependencies: FallbackCommentShadowDependencies = {
        ...fixture.dependencies,
        loadSource: async () => source,
        reloadSource: async () => source,
        createShadow: async (input) => {
            const id = created.length === 0 ? candidateA : candidateB;
            created.push(id);
            posts.set(id, { ...input, _id: new ObjectId(id) } as Post);
            if (created.length === 2) releaseBoth();
            await bothCreated;
            return posts.get(id)!;
        },
        loadPost: async (id) => posts.get(id.toHexString()) ?? null,
        linkIfMissing: async (_type, _sourceId, postId) => {
            linkAttempts++;
            if (postId === candidateB) await aLinked;
            if (source.commentPostId) return false;
            source = { ...source, commentPostId: postId };
            linkWins++;
            if (postId === candidateA) releaseA();
            return true;
        },
        isCandidateReferenced: async (postId) => source.commentPostId === postId,
        deleteCreatedShadow: async (postId) => {
            deleted.push(postId);
            posts.delete(postId);
        },
    };
    const [resultA, resultB] = await Promise.all([
        orchestrateFallbackCommentShadow(
            "task",
            fixture.sourceId.toHexString(),
            fixture.circleId.toHexString(),
            actorDid,
            dependencies,
        ),
        orchestrateFallbackCommentShadow(
            "task",
            fixture.sourceId.toHexString(),
            fixture.circleId.toHexString(),
            actorDid,
            dependencies,
        ),
    ]);
    assert.deepEqual(created, [candidateA, candidateB], "both attempts create candidates");
    assert.equal(linkAttempts, 2, "both attempts reach the conditional link");
    assert.equal(linkWins, 1, "exactly one conditional link wins");
    assert.equal(source.commentPostId, candidateA, "exactly one conditional backlink winner persists");
    assert.equal(resultA, candidateA);
    assert.equal(resultB, candidateA);
    assert.deepEqual(deleted, [candidateB], "cleanup targets only loser B");
    assert.equal(posts.has(candidateA), true, "winner A remains");
}

void main();
