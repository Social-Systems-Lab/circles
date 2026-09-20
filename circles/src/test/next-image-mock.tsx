import { mock } from "bun:test";

/**
 * Register a happy-dom-friendly stand-in for `next/image`.
 *
 * next/image runs its URL loader at render time and throws "Invalid URL" under happy-dom because
 * there is no Next.js image config. Call this BEFORE dynamically importing any module that pulls
 * in `next/image`, then import the component under test.
 *
 * The stand-in keeps layout props visible as data attributes so tests can still assert on them.
 */
export function mockNextImage(): void {
    mock.module("next/image", () => ({
        __esModule: true,
        default: ({ src, alt, fill, sizes, className, ...rest }: Record<string, unknown>) => (
            <img
                src={src as string}
                alt={alt as string}
                className={className as string}
                data-fill={fill ? "true" : undefined}
                data-sizes={sizes as string}
                {...rest}
            />
        ),
    }));
}
