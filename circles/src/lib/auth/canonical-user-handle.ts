const CANONICAL_USER_HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isCanonicalUserHandle = (handle: unknown): handle is string =>
    typeof handle === "string" &&
    handle.length >= 3 &&
    handle.length <= 20 &&
    CANONICAL_USER_HANDLE_PATTERN.test(handle);

export function assertCanonicalUserHandle(handle: unknown): asserts handle is string {
    if (!isCanonicalUserHandle(handle)) {
        throw new Error(
            "Handle must be 3-20 characters and use lowercase letters, numbers, and single internal hyphens only.",
        );
    }
}

export function assertCanonicalUserHandleChange(existingHandle: string | undefined, requestedHandle: unknown): void {
    if (requestedHandle === existingHandle) {
        return;
    }

    assertCanonicalUserHandle(requestedHandle);
}
