export const PRODUCTION_AUTH_COOKIE_NAME = "token";
export const DEVELOPMENT_AUTH_COOKIE_NAME = "circles_token";

export const AUTH_COOKIE_NAME =
    process.env.NODE_ENV === "production" ? PRODUCTION_AUTH_COOKIE_NAME : DEVELOPMENT_AUTH_COOKIE_NAME;

const LEGACY_AUTH_COOKIE_NAME = "token";

const AUTH_COOKIE_NAMES =
    AUTH_COOKIE_NAME === LEGACY_AUTH_COOKIE_NAME ? [AUTH_COOKIE_NAME] : [AUTH_COOKIE_NAME, LEGACY_AUTH_COOKIE_NAME];

type CookieReader = {
    get: (name: string) => { value?: string } | undefined;
};

export const readAuthToken = (cookiesStore: CookieReader): string | undefined => {
    for (const cookieName of AUTH_COOKIE_NAMES) {
        const token = cookiesStore.get(cookieName)?.value;
        if (token) {
            return token;
        }
    }
    return undefined;
};

export const getAuthCookieNamesForClearing = (): string[] => [...AUTH_COOKIE_NAMES];
