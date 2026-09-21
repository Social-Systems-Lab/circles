// Helpers for tests that change process.env. `process.env.NODE_ENV` is typed read-only by Next.js,
// so assignments go through a plain string map.

const env = process.env as Record<string, string | undefined>;

/** Set an environment variable, or remove it when `value` is undefined. */
export const setEnv = (name: string, value: string | undefined): void => {
    if (value === undefined) {
        delete env[name];
    } else {
        env[name] = value;
    }
};

/** Snapshot the named variables and return a function that restores them (call it in `afterEach`). */
export const snapshotEnv = (...names: string[]): (() => void) => {
    const saved = names.map((name) => [name, env[name]] as const);
    return () => {
        for (const [name, value] of saved) setEnv(name, value);
    };
};
