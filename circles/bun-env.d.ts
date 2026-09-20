/// <reference types="bun" />

// Ensures `bun:test` (and other `bun:*` modules) resolve under TypeScript's
// `moduleResolution: "bundler"`, which skips URI-like imports as files and relies
// on ambient declarations from `@types/bun` / `bun-types`.
