# DEPLOY TODO — dependency upgrade branch

Written for: the operator running the deploy, one command at a time.

The branch `deps-upgrade` patches the dependency vulnerabilities. **It has not been merged and has
not been deployed.** This file is the deploy procedure, to be run later, on request.

Nothing here is urgent. Do not run any of it until the pre-flight below is green.

---

## What makes this deploy different

This is the **first deploy on Node 22**. The Docker base images changed from `node:18-slim` and
`imbios/bun-node:18-slim` (Node 18 went end-of-life in April 2025) to their Node 22 equivalents.
The image build on the server is the riskiest step of this deploy — not the app code.

Have the currently running image tag written down before you start, so a rollback is one command.

---

## Pre-flight (all of this must pass before deploying)

Run on your **local Mac terminal**, in `circles/circles`:

```
bun run build
```

```
bun run test:modules
```

```
bun run test:components
```

Expected: build succeeds, module tests all pass, component tests show **16 failures**. Those 16 are
pre-existing and unrelated to this work — they are listed in the branch's commit history. Any other
failure is a stop.

```
bun audit
```

Expected: **no vulnerabilities**.

Then build the production image locally to prove the Node 22 build works before the server tries it:

```
docker build -t circles-deploy-check .
```

---

## Deploy

### 1. Merge the branch

On your **local Mac terminal**, in `circles/circles`:

```
git checkout main && git pull
```

```
git merge --ff-only deps-upgrade
```

If that fails with "not possible to fast-forward", **stop**. A conflict on main is a hard stop —
ask before doing anything else.

```
git push origin main
```

### 2. Check CIRCLES_URL before anything uploads

On the **Genesis2 production server** (`kamooniorg`):

```
cd /root/circles/circles && grep CIRCLES_URL .env
```

It must be `https://kamooni.org`. If it is `http://127.0.0.1` or anything local, **stop and fix it
first**. Image URLs are written into MongoDB at upload time from this value, so a wrong value
writes permanently broken URLs that need a database repair to undo.

### 3. Record the current image, for rollback

On the **Genesis2 production server**:

```
docker compose images circles
```

Write down the tag and image ID.

### 4. Deploy

On the **Genesis2 production server**:

```
cd /root/circles/circles && ./circles/deploy-genesis2.sh main
```

This rebuilds on Node 22 for the first time. Expect it to take longer than usual.

### 5. Verify

On the **Genesis2 production server** (or anywhere):

```
curl -sS https://kamooni.org/api/version && echo
```

The returned `gitSha` must match the commit you just deployed. If it does not, the new container is
not running.

Optional runtime check, on the **Genesis2 production server**:

```
cd /root/circles/circles && docker compose exec -T circles cat /app/VERSION
```

---

## Post-deploy smoke test

Do these in a **browser**, signed in, in this order. Each one exercises a library that changed.

1. **Images** (sharp 0.33 → 0.35, and the new Node 22 runtime)
   Upload a circle cover or avatar. Confirm the thumbnail renders and the full image loads. This is
   the single most important check — sharp is a native module and the Node version changed under it.

2. **File storage** (fast-xml-parser 4 → 5 under `minio`)
   Upload a file to a circle, list it, download it. Open a private-media item.

3. **Email** (postmark 4 → 5)
   Trigger a verification email and confirm it arrives.

4. **Chat**
   Send a message. Confirm the conversation jumps to the top of the sidebar — that ordering depends
   on `chatConversations.updatedAt` being bumped on insert.

5. **Search / onboarding** (Qdrant client migrated from `search()` to `query()`)
   Run a semantic search. Open onboarding and confirm the suggested SDGs, skills and mission
   statements still appear.

6. **UI bits** (cmdk 1.1, next-themes 0.4, tailwind-merge 3)
   Trigger any toast, open the command palette, toggle dark mode.

7. **File storage again** — specifically the webpack alias fix
   Same as check 2 (upload/list/download). This confirms the build actually contains a working
   `minio` bundle; if the alias in `next.config.mjs` were ever wrong, `/storage/[...path]` and
   `/uploads/[...path]` would 500 on first request rather than fail at build time.

---

## Rollback

If anything above fails, on the **Genesis2 production server**:

```
cd /root/circles/circles && docker compose down
```

Then redeploy the previous commit:

```
cd /root/circles/circles && ./circles/deploy-genesis2.sh <previous-commit-sha>
```

Verify with the same `curl` as step 5.

---

## Known remaining

None. `bun audit` reports zero vulnerabilities.

Two advisories were initially accepted as unreachable and later patched properly:

- **esbuild**, through `react-scan`'s own `dependencies` (not our code): overridden to `^0.25.0`.
  react-scan 0.2.14 never actually `require`s esbuild from the code path our `scan()` import uses —
  the only reference in its bundled `dist/index.js` is its own `package.json` re-embedded as a
  string constant for its CLI (`bin/cli.js`), which nothing in this repo invokes.
- **stream-json**, through `minio`: overridden to `^3.7.0`, plus a webpack alias in
  `next.config.mjs`. The real problem was a casing bug in minio's own bundled output —
  `dist/main/notification.js` and `dist/esm/notification.mjs` both import
  `"stream-json/jsonl/Parser.js"` (capital P), while stream-json 3.x ships the file as lowercase
  `parser.js`. macOS's case-insensitive filesystem hides this; Linux does not, so it only broke the
  Docker build, never a local Mac build. The alias redirects the broken specifier to the real file.
  Re-verified against a real MinIO server, including `client.listenBucketNotification()` — the one
  code path that actually loads this module.

Three upgrades were attempted and deliberately reverted, none of them security fixes:

- **React 19.0.0-RC → 19.3.0 stable** made Next's own cold production build time go from ~21
  seconds to 15 minutes, and 34 minutes on a second run. Verified against a control build on the
  RC and confirmed not to be caused by react-scan. Worth investigating on its own.
- **sonner 1 → 2** changes the Toaster DOM, its close control and dismissal behaviour, failing 6
  existing assertions. A real UI change, so out of scope for a security pass.
- **react-scan 0.5.7**, as above.

`react-day-picker` stays at 8.10.1 (v9+ is a full API rewrite used by five real forms) and
`@react-spring/web` at 9 (its only test mocks the package entirely, so an upgrade could not be
verified). Neither has an advisory.
