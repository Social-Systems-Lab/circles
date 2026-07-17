type LatestAsyncRunnerOptions<T> = {
    load: () => Promise<T>;
    apply: (value: T) => void;
    onError?: (error: unknown) => void;
    onStart?: () => void;
    onIdle?: () => void;
};

export type LatestAsyncRunner = {
    run: () => Promise<void>;
    cancel: () => void;
};

export const createLatestAsyncRunner = <T>(options: LatestAsyncRunnerOptions<T>): LatestAsyncRunner => {
    let active = false;
    let queued = false;
    let generation = 0;
    let cancelled = false;

    const run = async () => {
        if (cancelled) return;

        if (active) {
            queued = true;
            generation += 1;
            return;
        }

        active = true;
        options.onStart?.();

        try {
            while (!cancelled) {
                queued = false;
                const requestGeneration = ++generation;

                try {
                    const value = await options.load();
                    if (!cancelled && requestGeneration === generation && !queued) {
                        options.apply(value);
                    }
                } catch (error) {
                    if (!cancelled && requestGeneration === generation && !queued) {
                        options.onError?.(error);
                    }
                }

                if (!queued) {
                    break;
                }
            }
        } finally {
            active = false;
            if (!cancelled) {
                options.onIdle?.();
            }
        }
    };

    return {
        run,
        cancel: () => {
            cancelled = true;
            queued = false;
            generation += 1;
        },
    };
};
