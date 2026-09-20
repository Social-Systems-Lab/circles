/// <reference types="bun" />

import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// Runtime registration of these matchers lives in src/test/setup.ts (preloaded by bunfig.toml).
// Augment bun:test's Matchers so expect(...).toBeInTheDocument() etc. type-check.
declare module "bun:test" {
    interface Matchers<T = unknown> extends TestingLibraryMatchers<unknown, T> {}
}

export {};
