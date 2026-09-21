// Stand-in for `getAuthenticatedUserDid` from `@/lib/auth/auth`, which reads the session cookie through
// `next/headers`. Call it at the top of a test file, before importing the code under test:
//
//   const getAuthenticatedUserDid = mockAuthenticatedUser();          // signed in as "did:user" by default
//   const getAuthenticatedUserDid = mockAuthenticatedUser("did:admin"); // signed in as someone else
//   const getAuthenticatedUserDid = mockAuthenticatedUser(null);        // signed out by default
//   ...
//   getAuthenticatedUserDid.mockResolvedValue(undefined);              // in a test: signed out
//
// The mock goes back to the default before every test.

import { beforeEach, mock } from "bun:test";

export const DEFAULT_TEST_USER_DID = "did:user";

/** `defaultDid` is the signed-in user; `null` means nobody is signed in (the mock resolves `undefined`). */
export function mockAuthenticatedUser(defaultDid: string | null = DEFAULT_TEST_USER_DID) {
    return mockAuthModule(defaultDid).getAuthenticatedUserDid;
}

/**
 * Like `mockAuthenticatedUser`, but the module also exports an `isAuthorized` mock that allows everything until a
 * test says otherwise (`isAuthorized.mockResolvedValue(false)`). Both go back to their defaults before every test.
 */
export function mockAuthModule(defaultDid: string | null = DEFAULT_TEST_USER_DID) {
    const signedInDid = defaultDid ?? undefined;
    const getAuthenticatedUserDid = mock(async (): Promise<string | undefined> => signedInDid);
    const isAuthorized = mock(async (_userDid: string | undefined, _circleId: string, _feature: unknown): Promise<boolean> => true);
    mock.module("@/lib/auth/auth", () => ({ getAuthenticatedUserDid, isAuthorized }));

    beforeEach(() => {
        getAuthenticatedUserDid.mockReset();
        getAuthenticatedUserDid.mockResolvedValue(signedInDid);
        isAuthorized.mockReset();
        isAuthorized.mockResolvedValue(true);
    });

    return { getAuthenticatedUserDid, isAuthorized };
}
