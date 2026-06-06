# Dependency Upgrade And Risk Report

Report date: 2026-06-06

## Confirmed Latest TypeScript

`npm view typescript dist-tags --json` returned:

- `latest`: `6.0.3`
- `beta`: `6.0.0-beta`
- `rc`: `6.0.1-rc`
- `next`: `6.0.0-dev.20260416`

Conclusion: TypeScript v6 is the current latest release line, and this repo is using `typescript@6.0.3`.

## Upgraded Packages

- `next`: `16.2.7`
- `react`: `19.2.7`
- `react-dom`: `19.2.7`
- `typescript`: `6.0.3`
- `openai`: `6.42.0`
- `sharp`: `0.34.5`
- `jose`: `6.2.3`
- `isomorphic-dompurify`: `3.16.0`
- `stripe`: `22.2.0`
- `@playwright/test`: `1.60.0`
- `@react-spring/web`: `10.1.0`
- `cmdk`: `1.1.1`
- `react-scan`: `0.5.7`
- `uuid`: `14.0.0`
- `eslint-config-next`: `16.2.7`
- `eslint`: `9.39.4`
- `postcss`: `8.5.15`

Runtime container changes:

- Docker build/runtime base images moved from Node 18 to Node 22.
- Runtime Sharp install moved to `sharp@0.34.5`.

## Security Overrides

The following overrides were added or updated to remove known vulnerable transitive versions:

- `@babel/runtime`: `^7.29.7`
- `fast-xml-parser`: `^5.8.0`
- `postcss`: `^8.5.15`
- `protobufjs`: `^7.5.8`

## Removed Package

- `crypto-browserify` was removed because it was not imported by the app and pulled vulnerable elliptic-related transitive packages into the production audit graph.

## Audit Result

Command:

```powershell
npm audit --omit=dev --json --package-lock=false --legacy-peer-deps
```

Result:

- Total vulnerabilities: `0`
- Critical: `0`
- High: `0`
- Moderate: `0`
- Low: `0`

Notes:

- `bun pm scan` could not be used because this repo has no Bun security scanner configured.
- npm printed an engine warning for `ini@7.0.0` because local Node is `v24.12.0` while that package requests `^22.22.2 || ^24.15.0 || >=26.0.0`. This is local tooling risk, not an npm audit vulnerability.

## Deferred Upgrades

These packages still show newer major versions in `bun outdated`, but were not upgraded in this pass because they carry migration risk beyond a security patch pass:

- `mongodb` `6.21.0` -> `7.2.0`
- `tailwindcss` `3.4.19` -> `4.3.0`
- `zod` `3.25.76` -> `4.4.3`
- `recharts` `2.15.4` -> `3.8.1`
- `react-day-picker` `8.10.1` -> `10.0.1`
- `react-dropzone` `14.4.1` -> `15.0.0`
- `react-markdown` `9.1.0` -> `10.1.0`
- `sonner` `1.7.4` -> `2.0.7`
- `tailwind-merge` `2.6.1` -> `3.6.0`
- `@hookform/resolvers` `3.10.0` -> `5.4.0`
- `lucide-react` `0.484.0` -> `1.17.0`
- `framer-motion` remains on `12.0.0-alpha.1`; latest is `12.40.0`.

Recommended next pass:

- Upgrade UI library majors in one dedicated UI regression branch.
- Upgrade MongoDB in a separate data-access branch with chat and identity regression checks.
- Migrate Tailwind 4 separately because it changes PostCSS/Tailwind configuration expectations.

