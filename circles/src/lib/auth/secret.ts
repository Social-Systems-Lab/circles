export const getAuthenticationSecret = (): string => {
    const secret = process.env.CIRCLES_JWT_SECRET || process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("Missing JWT secret: set CIRCLES_JWT_SECRET (or JWT_SECRET for local development).");
    }
    return secret;
};
