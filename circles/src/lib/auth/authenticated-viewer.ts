import { errors } from "jose";

export async function resolveAuthenticatedViewerDid(
    authenticate: () => Promise<string | undefined>,
): Promise<string | undefined> {
    try {
        return await authenticate();
    } catch (error) {
        if (error instanceof errors.JOSEError) return undefined;
        throw error;
    }
}
