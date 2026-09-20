import { act, waitFor } from "@testing-library/react";

type WaitForOptions = Parameters<typeof waitFor>[1];

/**
 * Run `callback` inside `act` and always surface whatever React throws while
 * flushing. These helpers exist only to bring known deferred UI work (focus
 * bookkeeping, Floating UI microtasks) under `act` — they must never catch,
 * ignore, or rewrite errors from the tree under test.
 */
async function actAndRethrow(callback: () => void | Promise<void>): Promise<void> {
    // `act` already rethrows render/effect errors from the flushed work. Await
    // it so a rejected thenable fails the calling test instead of becoming an
    // unhandled rejection.
    await act(callback);
}

/**
 * Focus an element inside React's `act` so Radix roving-focus bookkeeping that
 * runs on the focus event is not reported as an update outside of act.
 */
export async function focusElement(element: HTMLElement): Promise<void> {
    await actAndRethrow(() => {
        element.focus();
    });
}

/**
 * Flush Floating UI's `computePosition` microtask after a floating element mounts.
 * Documented by Floating UI as the way to avoid Popper `act` warnings in tests:
 * https://floating-ui.com/docs/react#testing
 *
 * This only advances the microtask queue under `act`. It does not catch errors;
 * a throw from the flushed update fails the caller.
 */
export async function settleFloatingUi(): Promise<void> {
    await actAndRethrow(async () => {});
}

/**
 * Wait for an assertion, then settle Floating UI position state that usually
 * follows the DOM change `waitFor` was watching for.
 *
 * Assertion failures from `waitFor` propagate unchanged. Settlement runs only
 * after the assertion passes, and any error during settlement also propagates.
 */
export async function waitForUi(
    assertion: () => void | Promise<void>,
    options?: WaitForOptions,
): Promise<void> {
    await waitFor(assertion, options);
    await settleFloatingUi();
}
