// Global setup for component tests, preloaded by bun test (see bunfig.toml).
// happy-dom must be registered before React DOM is imported by any test file.

import { afterEach, expect } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// Radix primitives measure and observe elements that happy-dom does not implement.
// These stubs keep the components mountable without altering their behavior.
class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}

class DOMRectStub {
    constructor(
        public x = 0,
        public y = 0,
        public width = 0,
        public height = 0,
    ) {}
    get top() {
        return this.y;
    }
    get left() {
        return this.x;
    }
    get right() {
        return this.x + this.width;
    }
    get bottom() {
        return this.y + this.height;
    }
    toJSON() {
        return { ...this };
    }
}

const globalWithStubs = globalThis as Record<string, unknown>;

globalWithStubs.ResizeObserver ??= ResizeObserverStub;
globalWithStubs.DOMRect ??= DOMRectStub;

if (!globalThis.matchMedia) {
    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as typeof globalThis.matchMedia;
}

if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {};
}

if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = function hasPointerCapture() {
        return false;
    };
}

if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = function setPointerCapture() {};
}

if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = function releasePointerCapture() {};
}

// Radix Presence chooses between a synchronous unmount and an animation-driven one by reading
// `getComputedStyle(node).animationName` (@radix-ui/react-presence). Tailwind's animate-in
// classes give those nodes a real animation name, so Presence waits for `animationend` and then
// schedules a fill-mode reset on a macrotask — both of which land outside Testing Library's
// `act` under happy-dom and produce React's "not wrapped in act(...)" warning.
//
// Forcing animation/transition metrics to "none" / "0s" makes Presence take the synchronous
// path, which is the recommended way to keep overlay tests deterministic (disable animations in
// the test environment) rather than swallowing the warning.
const originalGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = ((element: Element, pseudoElt?: string | null) => {
    const styles = originalGetComputedStyle(element, pseudoElt);
    return new Proxy(styles, {
        get(target, property, receiver) {
            if (
                property === "animationName" ||
                property === "webkitAnimationName" ||
                property === "transitionProperty"
            ) {
                return "none";
            }
            if (
                property === "animationDuration" ||
                property === "webkitAnimationDuration" ||
                property === "transitionDuration" ||
                property === "webkitTransitionDuration" ||
                property === "transitionDelay" ||
                property === "webkitTransitionDelay"
            ) {
                return "0s";
            }
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
}) as typeof window.getComputedStyle;

// Testing Library modules bind to `document` when they load, so they may only be
// imported after happy-dom has registered its globals above.
const matchers = await import("@testing-library/jest-dom/matchers");
const { act, cleanup } = await import("@testing-library/react");

expect.extend({ ...matchers } as Parameters<typeof expect.extend>[0]);

// React Testing Library only auto-cleans up when a global afterEach exists,
// which bun test does not provide, so register it explicitly. Settle any
// leftover Floating UI microtasks under act before unmounting.
afterEach(async () => {
    await act(async () => {});
    cleanup();
});
