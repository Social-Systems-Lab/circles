import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { UserPrivate } from "@/models/models";
import {
    completeClientAuthenticationBoundary,
    executeAuthenticatedUserMutation,
    getAuthenticatedClientUserBoundary,
    getOwnedUserUpdateBoundary,
} from "./client-user-boundary";
import { toBookmarkStateDto, toGuidelineStateDto, toPinStateDto } from "./client-user-dto";

const makePrivateUser = (did: string): UserPrivate =>
    ({
        _id: `${did}-id`,
        did,
        name: `User ${did}`,
        handle: did.replaceAll(":", "-"),
        email: `PRIVATE_EMAIL_${did}`,
        matrixAccessToken: `PRIVATE_MATRIX_TOKEN_${did}`,
        passwordResetToken: `PRIVATE_RESET_TOKEN_${did}`,
        metadata: { secret: `PRIVATE_METADATA_${did}` },
        memberships: [],
        friends: [],
        pendingRequests: [],
        chatRoomMemberships: [],
        bookmarkedCircles: [],
        pinnedCircles: [],
    }) as unknown as UserPrivate;

const assertSanitized = (value: unknown): void => {
    const serialized = JSON.stringify(value);
    assert.doesNotMatch(serialized, /PRIVATE_/);
    assert.equal(serialized.includes("passwordResetToken"), false);
    assert.equal(serialized.includes("matrixAccessToken"), false);
    assert.equal(serialized.includes("metadata"), false);
};

const users = new Map([
    ["did:user:a", makePrivateUser("did:user:a")],
    ["did:user:b", makePrivateUser("did:user:b")],
]);
const requestedDids: string[] = [];
const getUserPrivate = async (did: string): Promise<UserPrivate> => {
    requestedDids.push(did);
    const user = users.get(did);
    assert.ok(user, `fixture user ${did} must exist`);
    return user;
};

async function main(): Promise<void> {
    const authenticatedUser = await getAuthenticatedClientUserBoundary({
        getAuthenticatedUserDid: async () => "did:user:a",
        getUserPrivate,
    });
    assert.equal(authenticatedUser?.did, "did:user:a");
    assert.deepEqual(requestedDids, ["did:user:a"], "the authenticated DID exclusively selects the account");
    assertSanitized(authenticatedUser);

    const owner = await getOwnedUserUpdateBoundary("did:user:a-id", {
        getAuthenticatedUserDid: async () => "did:user:a",
        getUserById: async (id) => (id === "did:user:a-id" ? users.get("did:user:a")! : null),
    });
    assert.equal(owner?.authenticatedDid, "did:user:a", "owner update succeeds");
    const crossAccount = await getOwnedUserUpdateBoundary("did:user:b-id", {
        getAuthenticatedUserDid: async () => "did:user:a",
        getUserById: async () => users.get("did:user:b")!,
    });
    assert.equal(crossAccount, undefined, "user A cannot update user B");

    async function testMutation(
        label: string,
        mutateFixture: (user: UserPrivate) => void,
        project: (user: UserPrivate) => unknown,
    ): Promise<void> {
        const targetedDids: string[] = [];
        const result = await executeAuthenticatedUserMutation(
            "did:user:a",
            { getUserPrivate },
            async (did, currentUser) => {
                targetedDids.push(did);
                mutateFixture(currentUser);
            },
            project,
        );
        assert.deepEqual(targetedDids, ["did:user:a"], `${label} targets only the authenticated DID`);
        assertSanitized(result);
    }

    await testMutation("bookmark mutation", (user) => (user.bookmarkedCircles = ["bookmark-a"]), toBookmarkStateDto);
    await testMutation(
        "pin mutation",
        (user) => {
            user.pinnedCircles = ["pin-a"];
            user.bookmarkedCircles = ["pin-a"];
        },
        toPinStateDto,
    );
    await testMutation("unpin mutation", (user) => (user.pinnedCircles = []), toPinStateDto);
    await testMutation(
        "guideline mutation",
        (user) => {
            user.communityGuidelinesAcceptedAt = new Date("2026-01-04T00:00:00.000Z");
        },
        toGuidelineStateDto,
    );

    const sessionDids: string[] = [];
    for (const flow of ["login", "signup"] as const) {
        const result = await completeClientAuthenticationBoundary("did:user:a", {
            getUserPrivate,
            createUserSession: async (_user, did) => {
                sessionDids.push(`${flow}:${did}`);
            },
        });
        assert.equal(result.did, "did:user:a", `VibeID ${flow} completion returns the authenticated account`);
        assertSanitized(result);
    }
    assert.deepEqual(sessionDids, ["login:did:user:a", "signup:did:user:a"]);

    // Next request/cookie module state makes the action shells impractical to import in this runner.
    // Retain narrow wiring contracts; authorization and serialization above are executable.
    const root = process.cwd();
    const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
    const home = read("src/components/modules/home/actions.ts");
    const pins = read("src/app/api/pins/route.ts");
    const auth = read("src/components/auth/actions.ts");
    const vibeId = read("src/lib/auth/vibe-id.ts");
    assert.match(home, /getAuthenticatedClientUserBoundary\(\{ getAuthenticatedUserDid, getUserPrivate \}\)/);
    assert.match(home, /getOwnedUserUpdateBoundary\(userId, \{ getAuthenticatedUserDid, getUserById \}\)/);
    assert.equal((home.match(/executeAuthenticatedUserMutation\(/g) ?? []).length, 3);
    assert.equal((pins.match(/executeAuthenticatedUserMutation\(/g) ?? []).length, 2);
    assert.match(auth, /user: toGuidelineStateDto\(updatedUser\)/);
    assert.equal((vibeId.match(/completeClientAuthenticationBoundary/g) ?? []).length, 3);

    console.log("client-user executable browser/auth boundary tests passed");
}

void main();
