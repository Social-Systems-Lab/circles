/**
 * Single source of truth for the end-to-end environment.
 *
 * Both sides of an e2e run have to agree on the same values: the Next.js server under test (configured
 * through `webServer.env` in playwright.config.ts) and the test process itself, which seeds and cleans
 * up Mongo directly and mints session cookies. Everything is read from here so the two can never drift.
 *
 * Every value can be overridden with an environment variable, which is how CI and "run against a server
 * I already started" both work without a second config file.
 */

const read = (name: string, fallback: string): string => {
    const value = process.env[name];
    return value === undefined || value === "" ? fallback : value;
};

/**
 * Port the application under test listens on.
 *
 * Deliberately not 3000: a developer's `bun run dev` server keeps running, pointed at the development
 * database, while the e2e stack runs beside it.
 */
export const APP_PORT = read("E2E_PORT", "3100");

/**
 * `localhost` rather than `127.0.0.1`: the Next.js dev server only trusts `allowedDevOrigins` and
 * localhost for its `/_next/*` assets, and next.config.mjs derives that list from CIRCLES_URL.
 */
export const BASE_URL = read("E2E_BASE_URL", `http://localhost:${APP_PORT}`);

/** Port of the Mongo instance started by docker-compose.e2e.yml (the development one stays on 27017). */
export const MONGO_PORT = read("E2E_MONGO_PORT", "27018");

export const MONGODB_URI = read(
    "E2E_MONGODB_URI",
    `mongodb://e2e:e2e@127.0.0.1:${MONGO_PORT}/circles?authSource=admin`,
);

/**
 * The application always calls `client.db("circles")` (src/lib/data/db.ts), regardless of the database
 * named in the connection string, so this is fixed rather than configurable.
 */
export const DATABASE_NAME = "circles";

/** Signs the session JWTs the tests hand to the browser. Must match the server's CIRCLES_JWT_SECRET. */
export const JWT_SECRET = read("E2E_JWT_SECRET", "e2e-jwt-secret-not-for-production");

export const ALTCHA_HMAC_KEY = read("E2E_ALTCHA_HMAC_KEY", "e2e-altcha-hmac-key-not-for-production");

/** MinIO used for uploads. Only tests that attach files need it to be running. */
export const MINIO_PORT = read("E2E_MINIO_PORT", "9100");
export const MINIO_ROOT_USER = read("E2E_MINIO_ROOT_USER", "e2eminio");
export const MINIO_ROOT_PASSWORD = read("E2E_MINIO_ROOT_PASSWORD", "e2eminiopassword");

/** Whether the global setup wipes the database before the run. See `assertSafeToReset` below. */
export const RESET_DATABASE = read("E2E_RESET_DATABASE", "true") !== "false";

/**
 * Identifies one `playwright test` run. Set by the global setup and inherited by every worker process,
 * so a run can always find and delete the documents it created — including after a crash.
 */
export const RUN_ID_ENV_VAR = "E2E_RUN_ID";

export const getRunId = (): string => {
    const runId = process.env[RUN_ID_ENV_VAR];
    if (!runId) {
        throw new Error(
            `${RUN_ID_ENV_VAR} is not set. The e2e global setup assigns it; run tests through playwright.config.ts.`,
        );
    }
    return runId;
};

/** Field stamped onto every seeded document so a run can delete exactly what it created. */
export const RUN_ID_FIELD = "e2eRunId";

/**
 * Refuses to wipe a database that looks like a shared one.
 *
 * Dropping the development database would destroy real local work, so resetting is only allowed for a
 * Mongo that is not on the default port. Pointing the tests at a shared instance on purpose stays
 * possible, it just has to be stated explicitly.
 */
export const assertSafeToReset = (): void => {
    const isDefaultMongoPort = /:27017(\/|$|\?)/.test(MONGODB_URI);
    const acknowledged = process.env.E2E_ALLOW_RESET_OF_SHARED_DATABASE === "true";

    if (isDefaultMongoPort && !acknowledged) {
        throw new Error(
            [
                `Refusing to reset the database at port 27017: that is the default Mongo port and is most likely`,
                `your development database.`,
                ``,
                `Start the dedicated e2e stack instead:  bun run e2e:services`,
                `Skip the reset and isolate by run id:   E2E_RESET_DATABASE=false`,
                `Reset it anyway (destroys its data):    E2E_ALLOW_RESET_OF_SHARED_DATABASE=true`,
            ].join("\n"),
        );
    }
};

/** Environment handed to the Next.js server under test. */
export const serverEnvironment = (): Record<string, string> => ({
    PORT: APP_PORT,
    MONGODB_URI,
    CIRCLES_JWT_SECRET: JWT_SECRET,
    ALTCHA_HMAC_KEY,
    CIRCLES_URL: BASE_URL,
    NEXT_PUBLIC_APP_URL: BASE_URL,
    // In production mode the middleware reaches its own access API at CIRCLES_HOST:CIRCLES_PORT, so
    // these have to be right when the suite runs against `next start` rather than `next dev`.
    CIRCLES_HOST: new URL(BASE_URL).hostname,
    CIRCLES_PORT: APP_PORT,
    // A production build would otherwise mark the session cookie Secure, and the browser would drop it
    // on plain http. The application exposes this override for exactly this situation.
    CIRCLES_COOKIE_SECURE: "false",
    MINIO_HOST: "127.0.0.1",
    MINIO_PORT,
    MINIO_ROOT_USERNAME: MINIO_ROOT_USER,
    MINIO_ROOT_PASSWORD,
    // Keys written during account creation land in a throwaway directory instead of ./circles_data.
    APP_DIR: "e2e/.tmp/app-data",
    CIRCLES_LOCAL_AUTH_DIR: "true",
    // The server talks to itself for middleware access checks; keep it on the e2e port.
    CIRCLES_DEV_INTERNAL_ORIGIN: BASE_URL,
    NEXT_PUBLIC_MAINTENANCE_MODE: "false",
    NEXT_TELEMETRY_DISABLED: "1",
});
