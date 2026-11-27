export type RateLimitResult = {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
};

export class RateLimiter {
    private readonly buckets = new Map<string, number[]>();
    private readonly maxKeys: number;
    private readonly nowFn: () => number;

    constructor(options?: { maxKeys?: number; now?: () => number }) {
        this.maxKeys = options?.maxKeys ?? 5000;
        this.nowFn = options?.now ?? (() => Date.now());
    }

    check(key: string, limit: number, windowMs: number): RateLimitResult {
        const now = this.nowFn();
        const cutoff = now - windowMs;
        const existing = (this.buckets.get(key) ?? []).filter((ts) => ts > cutoff);

        if (existing.length >= limit) {
            const oldest = existing[0] ?? now;
            const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
            this.buckets.set(key, existing);
            return {
                allowed: false,
                remaining: 0,
                retryAfterSeconds,
            };
        }

        if (!this.buckets.has(key) && this.buckets.size >= this.maxKeys) {
            const firstKey = this.buckets.keys().next().value;
            if (firstKey !== undefined) {
                this.buckets.delete(firstKey);
            }
        }

        existing.push(now);
        this.buckets.set(key, existing);
        return {
            allowed: true,
            remaining: Math.max(0, limit - existing.length),
            retryAfterSeconds: 0,
        };
    }
}

export const pushMutationRateLimiter = new RateLimiter();
export const pushTestRateLimiter = new RateLimiter();
