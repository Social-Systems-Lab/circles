import type { Circle, UserPrivate } from "@/models/models";
import { toAuthenticatedClientUser, type AuthenticatedClientUser } from "./client-user-dto";

export async function getAuthenticatedClientUserBoundary(deps: {
    getAuthenticatedUserDid: () => Promise<string | undefined>;
    getUserPrivate: (did: string) => Promise<UserPrivate>;
}): Promise<AuthenticatedClientUser | undefined> {
    const did = await deps.getAuthenticatedUserDid();
    return did ? toAuthenticatedClientUser(await deps.getUserPrivate(did)) : undefined;
}

export async function getOwnedUserUpdateBoundary(
    userId: string,
    deps: {
        getAuthenticatedUserDid: () => Promise<string | undefined>;
        getUserById: (id: string) => Promise<Circle | null>;
    },
): Promise<{ authenticatedDid: string; currentUser: Circle } | undefined> {
    const authenticatedDid = await deps.getAuthenticatedUserDid();
    if (!authenticatedDid) return undefined;
    const currentUser = await deps.getUserById(userId);
    return currentUser?.did === authenticatedDid ? { authenticatedDid, currentUser } : undefined;
}

export async function executeAuthenticatedUserMutation<T>(
    authenticatedDid: string | undefined,
    deps: { getUserPrivate: (did: string) => Promise<UserPrivate> },
    mutate: (did: string, currentUser: UserPrivate) => Promise<void>,
    project: (updatedUser: UserPrivate) => T,
): Promise<T | undefined> {
    if (!authenticatedDid) return undefined;
    const currentUser = await deps.getUserPrivate(authenticatedDid);
    await mutate(authenticatedDid, currentUser);
    return project(await deps.getUserPrivate(authenticatedDid));
}

export async function completeClientAuthenticationBoundary(
    userDid: string,
    deps: {
        getUserPrivate: (did: string) => Promise<UserPrivate>;
        createUserSession: (user: UserPrivate, did: string) => Promise<unknown>;
    },
): Promise<AuthenticatedClientUser> {
    const privateUser = await deps.getUserPrivate(userDid);
    await deps.createUserSession(privateUser, userDid);
    return toAuthenticatedClientUser(privateUser);
}
