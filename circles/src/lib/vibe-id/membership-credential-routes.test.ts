import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import type { Circle, Member } from "@/models/models";
import type { MembershipCredentialHandoff } from "./membership-credential-handoffs";
import type { MembershipCredentialStatus } from "./membership-credential-statuses";

const issuerKey = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey;
process.env.VIBE_ID_CREDENTIAL_ISSUER_PRIVATE_JWK = JSON.stringify(issuerKey.export({ format: "jwk" }));
process.env.NEXT_PUBLIC_SITE_URL = "https://kamooni.example";

const {
    createCircleMembershipCredentialEnvelopeForAccount,
    createPlatformMembershipCredentialEnvelopeForAccount,
    revalidateCircleMembershipCredentialAuthorization,
    revalidatePlatformMembershipCredentialAuthorization,
    verifyCircleMembershipCredentialEnvelope,
} = await import("./membership-credentials");
const { createMembershipCredentialHandoffForSession, redeemMembershipCredentialHandoff } = await import(
    "./membership-credential-handoffs"
);
const { createMembershipCredentialStatusCapability, resolveMembershipCredentialStatus } = await import(
    "./membership-credential-statuses"
);
const platformStatus = await import("@/app/api/vibe-id/credentials/platform-membership/status/route");
const circleStatus = await import("@/app/api/vibe-id/credentials/circle-membership/status/route");
const platformClaim = await import("@/app/api/vibe-id/credentials/platform-membership/claim/route");
const circleClaim = await import("@/app/api/vibe-id/credentials/circle-membership/claim/route");

const OWN_KAMOONI_DID = "did:kamooni:viewer";
const OWN_VIBE_DID = "did:vibe:viewer";
const OTHER_VIBE_DID = "did:vibe:other";
const CIRCLE_ID = new ObjectId().toString();
const UNKNOWN_CIRCLE_ID = new ObjectId().toString();
const TOKEN = "a".repeat(43);
const NOW = new Date("2026-10-03T12:00:00.000Z");

const user = (overrides: Partial<Circle> = {}) =>
    ({
        _id: new ObjectId(),
        circleType: "user",
        did: OWN_KAMOONI_DID,
        isMember: true,
        metadata: { authProviders: { vibeId: { did: OWN_VIBE_DID } } },
        ...overrides,
    }) as Circle;
const circle = { _id: CIRCLE_ID, circleType: "circle", name: "Private Circle", handle: "private" } as Circle;
const member = (overrides: Partial<Member> = {}) =>
    ({ userDid: OWN_KAMOONI_DID, circleId: CIRCLE_ID, userGroups: ["custom-only"], ...overrides }) as Member;

const helperDependencies = (overrides: Record<string, unknown> = {}) => ({
    findUser: async () => user(),
    findCircle: async (circleId: string) => (circleId === CIRCLE_ID ? circle : null),
    findMember: async () => member(),
    ...overrides,
});

class FakeHandoffs {
    records: MembershipCredentialHandoff[] = [];
    failConsumedTransition = false;

    async insertOne(record: MembershipCredentialHandoff) {
        this.records.push(structuredClone(record));
        return { acknowledged: true };
    }

    async findOne(filter: Record<string, unknown>) {
        return this.records.find((record) => matches(record, filter)) ?? null;
    }

    async findOneAndUpdate(filter: Record<string, unknown>, update: { $set: Partial<MembershipCredentialHandoff> }) {
        if (this.failConsumedTransition && update.$set.state === "consumed") return null;
        const record = this.records.find((candidate) => matches(candidate, filter));
        if (!record) return null;
        Object.assign(record, update.$set);
        return structuredClone(record);
    }
}

class FakeStatuses {
    records: MembershipCredentialStatus[] = [];

    async insertOne(record: MembershipCredentialStatus) {
        this.records.push(structuredClone(record));
        return { acknowledged: true };
    }

    async findOne(filter: Record<string, unknown>) {
        return this.records.find((record) => matches(record as never, filter)) ?? null;
    }
}

function matches(record: MembershipCredentialHandoff, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, expected]) => {
        const actual = record[key as keyof MembershipCredentialHandoff];
        if (expected && typeof expected === "object" && "$gt" in expected) {
            return actual instanceof Date && actual > (expected as { $gt: Date }).$gt;
        }
        return actual === expected;
    });
}

const envelope = (subjectDid = OWN_VIBE_DID) => ({
    kind: "credential.v1" as const,
    credential: {
        id: "credential-id",
        type: "membership",
        issuer: "did:vibe:issuer",
        subjectDid,
        claims: {},
        issuedAt: NOW.toISOString(),
        alg: "P-256" as const,
        signature: "signature",
    },
});

const handoffDependencies = (overrides: Record<string, unknown> = {}) => {
    const collection = new FakeHandoffs();
    const calls = { platform: 0, circle: 0 };
    return {
        collection,
        calls,
        dependencies: {
            authenticate: async () => OWN_KAMOONI_DID,
            findUser: async () => user(),
            collection: collection as never,
            issuePlatform: async (input: { authenticatedUserDid: string; expectedSubjectVibeDid: string }) => {
                calls.platform += 1;
                return input.authenticatedUserDid === OWN_KAMOONI_DID && input.expectedSubjectVibeDid === OWN_VIBE_DID
                    ? envelope()
                    : null;
            },
            issueCircle: async (input: {
                circleId: string;
                authenticatedUserDid: string;
                expectedSubjectVibeDid: string;
            }) => {
                calls.circle += 1;
                return input.circleId === CIRCLE_ID &&
                    input.authenticatedUserDid === OWN_KAMOONI_DID &&
                    input.expectedSubjectVibeDid === OWN_VIBE_DID
                    ? envelope()
                    : null;
            },
            revalidatePlatform: async () => true,
            revalidateCircle: async () => true,
            now: () => NOW,
            randomToken: () => TOKEN,
            createStatusCapability: async (input: { credentialType: "platform" | "circle" }) => ({
                token: "s".repeat(43),
                statusUrl: `https://kamooni.example/api/vibe-id/credentials/${input.credentialType}-membership/status?token=${"s".repeat(43)}`,
            }),
            ...overrides,
        },
    };
};

test("real platform helper enforces membership and the linked subject", async () => {
    const valid = await createPlatformMembershipCredentialEnvelopeForAccount(
        { authenticatedUserDid: OWN_KAMOONI_DID, expectedSubjectVibeDid: OWN_VIBE_DID },
        helperDependencies(),
    );
    assert.equal(valid?.credential.subjectDid, OWN_VIBE_DID);
    assert.equal(
        await createPlatformMembershipCredentialEnvelopeForAccount(
            { authenticatedUserDid: OWN_KAMOONI_DID, expectedSubjectVibeDid: OWN_VIBE_DID },
            helperDependencies({ findUser: async () => user({ isMember: false, manualMember: false }) }),
        ),
        null,
    );
    assert.equal(
        await createPlatformMembershipCredentialEnvelopeForAccount(
            { authenticatedUserDid: OWN_KAMOONI_DID, expectedSubjectVibeDid: OTHER_VIBE_DID },
            helperDependencies(),
        ),
        null,
    );
});

test("final authorization helpers re-read authoritative platform, link, circle, and membership state", async () => {
    const platformInput = {
        authenticatedUserDid: OWN_KAMOONI_DID,
        expectedSubjectVibeDid: OWN_VIBE_DID,
    };
    assert.equal(await revalidatePlatformMembershipCredentialAuthorization(platformInput, helperDependencies()), true);
    assert.equal(
        await revalidatePlatformMembershipCredentialAuthorization(
            platformInput,
            helperDependencies({ findUser: async () => user({ isMember: false, manualMember: false }) }),
        ),
        false,
    );
    assert.equal(
        await revalidatePlatformMembershipCredentialAuthorization(
            platformInput,
            helperDependencies({
                findUser: async () =>
                    user({ metadata: { authProviders: { vibeId: { did: OTHER_VIBE_DID } } } } as Partial<Circle>),
            }),
        ),
        false,
    );

    const circleInput = { ...platformInput, circleId: CIRCLE_ID };
    assert.equal(await revalidateCircleMembershipCredentialAuthorization(circleInput, helperDependencies()), true);
    assert.equal(
        await revalidateCircleMembershipCredentialAuthorization(
            circleInput,
            helperDependencies({ findMember: async () => null }),
        ),
        false,
    );
    assert.equal(
        await revalidateCircleMembershipCredentialAuthorization(
            circleInput,
            helperDependencies({ findCircle: async () => null }),
        ),
        false,
    );
});

test("new signed credentials use only opaque status URLs", async () => {
    const platformStatusUrl = `https://kamooni.example/api/vibe-id/credentials/platform-membership/status?token=${"p".repeat(43)}`;
    const circleStatusUrl = `https://kamooni.example/api/vibe-id/credentials/circle-membership/status?token=${"c".repeat(43)}`;
    const platform = await createPlatformMembershipCredentialEnvelopeForAccount(
        { authenticatedUserDid: OWN_KAMOONI_DID, expectedSubjectVibeDid: OWN_VIBE_DID, statusUrl: platformStatusUrl },
        helperDependencies(),
    );
    const circleCredential = await createCircleMembershipCredentialEnvelopeForAccount(
        {
            circleId: CIRCLE_ID,
            authenticatedUserDid: OWN_KAMOONI_DID,
            expectedSubjectVibeDid: OWN_VIBE_DID,
            statusUrl: circleStatusUrl,
        },
        helperDependencies(),
    );
    for (const [credential, expectedUrl] of [
        [platform, platformStatusUrl],
        [circleCredential, circleStatusUrl],
    ] as const) {
        assert.equal(credential?.credential.statusUrl, expectedUrl);
        const url = new URL(credential!.credential.statusUrl!);
        assert.deepEqual([...url.searchParams.keys()], ["token"]);
        assert.equal(url.toString().includes(OWN_VIBE_DID), false);
        assert.equal(url.toString().includes(CIRCLE_ID), false);
    }
});

test("opaque status capabilities store only hashes and disclose only validity", async () => {
    const collection = new FakeStatuses();
    const dependencies = {
        collection: collection as never,
        findUser: async () => user(),
        findCircle: async () => circle,
        findMember: async () => member(),
        now: () => NOW,
        randomToken: () => "s".repeat(43),
    };
    const capability = await createMembershipCredentialStatusCapability(
        {
            credentialType: "circle",
            authenticatedUserDid: OWN_KAMOONI_DID,
            linkedVibeDid: OWN_VIBE_DID,
            circleId: CIRCLE_ID,
        },
        dependencies,
    );
    assert.deepEqual([...new URL(capability.statusUrl).searchParams.keys()], ["token"]);
    assert.equal(JSON.stringify(collection.records).includes(capability.token), false);
    assert.equal(
        await resolveMembershipCredentialStatus({ token: capability.token, credentialType: "circle" }, dependencies),
        "active",
    );
    assert.equal(
        await resolveMembershipCredentialStatus({ token: "bad", credentialType: "circle" }, dependencies),
        "unknown",
    );
    assert.deepEqual(Object.keys({ status: "active", checkedAt: NOW.toISOString() }), ["status", "checkedAt"]);
});

test("circle status is revoked when the circle is missing or resolves to a user entity", async () => {
    for (const resolvedCircle of [null, user()] as const) {
        const collection = new FakeStatuses();
        const dependencies = {
            collection: collection as never,
            findUser: async () => user(),
            findCircle: async () => resolvedCircle,
            findMember: async () => member(),
            now: () => NOW,
            randomToken: () => "s".repeat(43),
        };
        const capability = await createMembershipCredentialStatusCapability(
            {
                credentialType: "circle",
                authenticatedUserDid: OWN_KAMOONI_DID,
                linkedVibeDid: OWN_VIBE_DID,
                circleId: CIRCLE_ID,
            },
            dependencies,
        );
        assert.equal(
            await resolveMembershipCredentialStatus(
                { token: capability.token, credentialType: "circle" },
                dependencies,
            ),
            "revoked",
        );
    }
});

test("real circle helper accepts canonical membership without members group and signs it", async () => {
    const valid = await createCircleMembershipCredentialEnvelopeForAccount(
        { circleId: CIRCLE_ID, authenticatedUserDid: OWN_KAMOONI_DID, expectedSubjectVibeDid: OWN_VIBE_DID },
        helperDependencies(),
    );
    assert.equal(valid?.credential.subjectDid, OWN_VIBE_DID);
    assert.equal(verifyCircleMembershipCredentialEnvelope(valid).ok, true);
    assert.equal(
        await createCircleMembershipCredentialEnvelopeForAccount(
            { circleId: CIRCLE_ID, authenticatedUserDid: OWN_KAMOONI_DID, expectedSubjectVibeDid: OWN_VIBE_DID },
            helperDependencies({ findMember: async () => member({ userDid: "did:kamooni:other" }) }),
        ),
        null,
    );
});

test("real circle helper rejects malformed, unknown, unlinked, nonmember, and cross-DID inputs", async () => {
    const input = { circleId: CIRCLE_ID, authenticatedUserDid: OWN_KAMOONI_DID, expectedSubjectVibeDid: OWN_VIBE_DID };
    assert.equal(
        await createCircleMembershipCredentialEnvelopeForAccount({ ...input, circleId: "bad" }, helperDependencies()),
        null,
    );
    assert.equal(
        await createCircleMembershipCredentialEnvelopeForAccount(
            { ...input, circleId: UNKNOWN_CIRCLE_ID },
            helperDependencies(),
        ),
        null,
    );
    assert.equal(
        await createCircleMembershipCredentialEnvelopeForAccount(
            input,
            helperDependencies({ findUser: async () => user({ metadata: undefined }) }),
        ),
        null,
    );
    assert.equal(
        await createCircleMembershipCredentialEnvelopeForAccount(
            input,
            helperDependencies({ findMember: async () => null }),
        ),
        null,
    );
    assert.equal(
        await createCircleMembershipCredentialEnvelopeForAccount(
            { ...input, expectedSubjectVibeDid: OTHER_VIBE_DID },
            helperDependencies(),
        ),
        null,
    );
});

test("handoff creation requires authentication and a linked, entitled account", async () => {
    const anonymous = handoffDependencies({ authenticate: async () => undefined }).dependencies;
    assert.equal(await createMembershipCredentialHandoffForSession({ credentialType: "platform" }, anonymous), null);
    assert.equal(
        await createMembershipCredentialHandoffForSession({ credentialType: "circle", circleId: CIRCLE_ID }, anonymous),
        null,
    );

    for (const dependencies of [
        handoffDependencies({ findUser: async () => user({ metadata: undefined }) }).dependencies,
        handoffDependencies({ issuePlatform: async () => null }).dependencies,
    ]) {
        assert.equal(
            await createMembershipCredentialHandoffForSession({ credentialType: "platform" }, dependencies),
            null,
        );
    }
    const nonmember = handoffDependencies({ issueCircle: async () => null });
    assert.equal(
        await createMembershipCredentialHandoffForSession(
            { credentialType: "circle", circleId: CIRCLE_ID },
            nonmember.dependencies,
        ),
        null,
    );

    const circleFailures = handoffDependencies();
    assert.equal(
        await createMembershipCredentialHandoffForSession(
            { credentialType: "circle", circleId: "malformed" },
            circleFailures.dependencies,
        ),
        null,
    );
    assert.equal(
        await createMembershipCredentialHandoffForSession(
            { credentialType: "circle", circleId: UNKNOWN_CIRCLE_ID },
            circleFailures.dependencies,
        ),
        null,
    );

    const substitutedSubject = handoffDependencies({ issuePlatform: async () => envelope(OTHER_VIBE_DID) });
    assert.equal(
        await createMembershipCredentialHandoffForSession(
            { credentialType: "platform" },
            substitutedSubject.dependencies,
        ),
        null,
    );
});

test("circle handoff is opaque, short-lived, and bound server-side", async () => {
    const { collection, dependencies } = handoffDependencies();
    const result = await createMembershipCredentialHandoffForSession(
        { credentialType: "circle", circleId: CIRCLE_ID },
        dependencies,
    );
    assert.ok(result);
    assert.equal(result.subjectVibeDid, OWN_VIBE_DID);
    assert.equal(result.credentialUrl.includes(OWN_VIBE_DID), false);
    assert.equal(result.credentialUrl.includes(CIRCLE_ID), false);
    assert.equal(result.deepLinkUrl.includes("Private Circle"), false);
    assert.deepEqual([...new URL(result.credentialUrl).searchParams.keys()], ["token"]);
    assert.equal(collection.records[0].linkedVibeDid, OWN_VIBE_DID);
    assert.equal(collection.records[0].circleId, CIRCLE_ID);
    assert.equal(collection.records[0].expiresAt.getTime() - collection.records[0].createdAt.getTime(), 300_000);
});

test("wallet redemption needs no session and uses only stored context", async () => {
    const { dependencies } = handoffDependencies({ authenticate: async () => undefined });
    const collection = dependencies.collection as never as FakeHandoffs;
    await collection.insertOne(pendingCircleHandoff());
    const redeemed = await redeemMembershipCredentialHandoff({ token: TOKEN, credentialType: "circle" }, dependencies);
    assert.equal(redeemed?.credential.subjectDid, OWN_VIBE_DID);
});

test("unknown, expired, consumed, malformed, and wrong-type handoffs fail identically", async () => {
    const results: Array<unknown> = [];
    for (const setup of ["unknown", "expired", "consumed", "malformed", "wrong-type"] as const) {
        const { collection, dependencies } = handoffDependencies();
        if (setup !== "unknown" && setup !== "malformed") {
            await collection.insertOne(
                pendingCircleHandoff({
                    credentialType: setup === "wrong-type" ? "platform" : "circle",
                    expiresAt: new Date(NOW.getTime() + (setup === "expired" ? -1 : 300_000)),
                    state: setup === "consumed" ? "consumed" : "pending",
                }),
            );
        }
        results.push(
            await redeemMembershipCredentialHandoff(
                { token: setup === "malformed" ? "bad" : TOKEN, credentialType: "circle" },
                dependencies,
            ),
        );
    }
    assert.deepEqual(results, [null, null, null, null, null]);
});

test("single-use handoff permits exactly one concurrent redemption and rejects replay", async () => {
    const { collection, calls, dependencies } = handoffDependencies();
    await collection.insertOne({ ...pendingCircleHandoff(), credentialType: "platform", circleId: undefined });
    const results = await Promise.all(
        Array.from({ length: 8 }, () =>
            redeemMembershipCredentialHandoff({ token: TOKEN, credentialType: "platform" }, dependencies),
        ),
    );
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(calls.platform, 1);
    assert.equal(
        await redeemMembershipCredentialHandoff({ token: TOKEN, credentialType: "platform" }, dependencies),
        null,
    );
    assert.equal(collection.records[0].state, "consumed");
});

test("authorization changes while signing are caught by final revalidation and consumed", async () => {
    for (const scenario of [
        "platform-revoked",
        "linked-did-changed",
        "circle-member-removed",
        "circle-deleted",
    ] as const) {
        let releaseSigning!: () => void;
        let signingStarted!: () => void;
        const started = new Promise<void>((resolve) => (signingStarted = resolve));
        const release = new Promise<void>((resolve) => (releaseSigning = resolve));
        let authorized = true;
        const { collection, dependencies } = handoffDependencies({
            issuePlatform: async () => {
                signingStarted();
                await release;
                return envelope();
            },
            issueCircle: async () => {
                signingStarted();
                await release;
                return envelope();
            },
            revalidatePlatform: async () => authorized,
            revalidateCircle: async () => authorized,
        });
        const credentialType = scenario.startsWith("circle") ? "circle" : "platform";
        await collection.insertOne(
            credentialType === "circle"
                ? pendingCircleHandoff()
                : { ...pendingCircleHandoff(), credentialType: "platform", circleId: undefined },
        );
        const redemption = redeemMembershipCredentialHandoff({ token: TOKEN, credentialType }, dependencies);
        await started;
        authorized = false;
        releaseSigning();
        assert.equal(await redemption, null, scenario);
        assert.equal(collection.records[0].state, "consumed", scenario);
        assert.equal(
            await redeemMembershipCredentialHandoff({ token: TOKEN, credentialType }, dependencies),
            null,
            scenario,
        );
    }
});

test("a failed final consumed transition never returns the signed credential", async () => {
    const { collection, dependencies } = handoffDependencies();
    await collection.insertOne({ ...pendingCircleHandoff(), credentialType: "platform", circleId: undefined });
    collection.failConsumedTransition = true;
    assert.equal(
        await redeemMembershipCredentialHandoff({ token: TOKEN, credentialType: "platform" }, dependencies),
        null,
    );
    assert.equal(collection.records[0].state, "redeeming");
});

test("authorization changes before redemption invalidate the handoff", async () => {
    for (const issuePlatform of [async () => null, async () => null]) {
        const { collection, dependencies } = handoffDependencies({ issuePlatform });
        await collection.insertOne({ ...pendingCircleHandoff(), credentialType: "platform", circleId: undefined });
        assert.equal(
            await redeemMembershipCredentialHandoff({ token: TOKEN, credentialType: "platform" }, dependencies),
            null,
        );
        assert.equal(collection.records[0].state, "consumed");
        assert.equal(
            await redeemMembershipCredentialHandoff({ token: TOKEN, credentialType: "platform" }, dependencies),
            null,
        );
    }
});

test("internal signing failure is consumed and cannot reopen or duplicate issuance", async () => {
    let attempts = 0;
    const { collection, dependencies } = handoffDependencies({
        issuePlatform: async () => {
            attempts += 1;
            throw new Error("synthetic signing failure");
        },
    });
    await collection.insertOne({ ...pendingCircleHandoff(), credentialType: "platform", circleId: undefined });
    assert.equal(
        await redeemMembershipCredentialHandoff({ token: TOKEN, credentialType: "platform" }, dependencies),
        null,
    );
    assert.equal(collection.records[0].state, "consumed");
    assert.equal(
        await redeemMembershipCredentialHandoff({ token: TOKEN, credentialType: "platform" }, dependencies),
        null,
    );
    assert.equal(attempts, 1);
});

test("legacy raw status probes remain neutral and no-store", async () => {
    const responses = await Promise.all([
        platformStatus.GET(request()),
        platformStatus.GET(request({ subjectDid: OWN_VIBE_DID })),
        circleStatus.GET(request({ circleId: CIRCLE_ID, subjectDid: OWN_VIBE_DID })),
        circleStatus.GET(request({ circleId: UNKNOWN_CIRCLE_ID, subjectDid: OTHER_VIBE_DID })),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    assert.deepEqual(
        bodies.map(({ status }) => status),
        ["unknown", "unknown", "unknown", "unknown"],
    );
    responses.forEach((response) => assert.equal(response.headers.get("cache-control"), "no-store"));
});

test("claim errors have neutral privacy headers", async () => {
    const responses = await Promise.all([platformClaim.GET(request({ token: "bad" })), circleClaim.GET(request())]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    assert.deepEqual(bodies, [
        { success: false, message: "Credential is not available." },
        { success: false, message: "Credential is not available." },
    ]);
    responses.forEach((response) => {
        assert.equal(response.status, 404);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    });
});

function pendingCircleHandoff(overrides: Partial<MembershipCredentialHandoff> = {}): MembershipCredentialHandoff {
    return {
        tokenHash: crypto.createHash("sha256").update(TOKEN).digest("base64url"),
        credentialType: "circle",
        authenticatedUserDid: OWN_KAMOONI_DID,
        linkedVibeDid: OWN_VIBE_DID,
        circleId: CIRCLE_ID,
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + 300_000),
        state: "pending",
        ...overrides,
    };
}

function request(params: Record<string, string> = {}) {
    const url = new URL("http://localhost/status");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return new NextRequest(url);
}
