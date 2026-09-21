# End-to-end tests

Browser tests that drive the real application: a real Next.js server, a real Mongo database, real
middleware and server actions. They answer "does this work when it is all plugged together", which is
the one thing the unit suites (`bun run test:modules`) and component suites (`bun run test:components`)
cannot.

## Running them

```bash
bun run e2e:install     # once: download the Chromium build Playwright uses
bun run e2e:services    # once per session: start the test database
bun run e2e             # run everything
```

`bun run e2e` starts the application itself, on port 3100, pointed at the test database. Your own
`bun run dev` server on port 3000 keeps running against your development data and is never touched.

| Command | What it does |
| --- | --- |
| `bun run e2e` | Run the whole suite headless |
| `bun run e2e:ui` | Playwright's watch mode — pick tests, step through them, inspect the DOM |
| `bun run e2e:headed` | Watch the browser do it |
| `bun run e2e:debug` | Step through a test with the inspector |
| `bun run e2e:report` | Open the HTML report from the last run |
| `bun run e2e:services:down` | Stop the test database and delete its data |

Narrow a run the usual ways: `bun run e2e circle-access`, `bun run e2e --grep "secret circle"`,
`bun run e2e --project=chromium`.

## Writing a test

Import `test` and `expect` from `../support/fixtures`, never from `@playwright/test` directly — that is
what brings the database and sign-in helpers with them.

```ts
import { expect, test } from "../support/fixtures";

test("a member can open a secret circle", async ({ page, seed, signInAs }) => {
    const member = await seed.user();
    const circle = await seed.circleOwnedBy(member, { visibility: "secret" });
    await signInAs(member);

    await page.goto(`/circles/${circle.handle}`);

    await expect(page.getByText(circle.name).first()).toBeVisible();
});
```

### Fixtures

- **`seed`** — creates data and deletes it when the test ends. `seed.user()`, `seed.adminUser()`,
  `seed.circle()`, `seed.circleOwnedBy()`, `seed.member()`, and `seed.insert(collection, document)` for
  anything without a factory. Every factory takes overrides: `seed.user({ isEmailVerified: false })`.
- **`signInAs(user)`** — gives the browser that user's session.
- **`signOutCurrentUser()`** — drops the session.
- **`db`** — the raw Mongo database, for asserting on what the application actually wrote.

### Already signed in

Most tests only need "some signed-in user". Two accounts are created once per run, and a test can start
already signed in as one of them:

```ts
import { readSharedUser, storageStatePath } from "../support/shared-users";

test.describe("a signed-in user", () => {
    test.use({ storageState: storageStatePath("member") });   // or "admin"

    test("sees their profile", async ({ page }) => {
        const member = readSharedUser("member");
        await page.goto(`/circles/${member.handle}`);
    });
});
```

Use `seed.user()` instead whenever the test **changes** the user — its profile, memberships or
settings — so parallel tests cannot disturb each other.

## How it works

### Authentication

Tests do not fill in the login form. They mint the same HS256 session token the application issues
(`support/session.ts` mirrors `generateUserToken` in `src/lib/auth/jwt.ts`) and hand it to the browser
as a cookie. The server then verifies it exactly as it would for a real visitor — middleware, access
API, server actions and all.

This is deliberately **not** a "skip auth when testing" flag. There is no bypass branch anywhere in
`src/`, so there is nothing that could be switched on in production, and the authentication path the
tests run through is the real one.

The cookie is written as `token`. `src/lib/auth/cookie.ts` uses `circles_token` outside production and
`token` inside it, but always accepts `token` as a fallback, so one stored session works against a
server started either way.

The login form itself is still tested — by the tests that are about logging in.

### Clean state

`global-setup.ts` empties the database before the run and seeds the reference data (causes, skills) a
real instance has. It deletes documents rather than dropping the database, so the indexes the server
created at startup survive.

During the run, isolation comes from the data itself: every seeded handle, email and DID is unique, so
tests can run in parallel against one database. The `seed` fixture deletes what it created when a test
finishes, pass or fail.

Every seeded document also carries an `e2eRunId` field. If a test crashes or is interrupted before its
cleanup runs, `global-teardown.ts` still finds its documents and removes them.

The reset refuses to run against Mongo on port 27017, the default port, on the assumption that it is
your development database. Overriding that is possible but has to be said out loud
(`E2E_ALLOW_RESET_OF_SHARED_DATABASE=true`).

### Reports, videos and screenshots

A failing test leaves behind a screenshot at the point of failure, a video of the run, and — on the
retry — a trace: a step-by-step recording with the DOM, network and console at every action. Open the
last run with `bun run e2e:report`, and drop a trace into [trace.playwright.dev](https://trace.playwright.dev)
to step through it.

A passing run leaves nothing behind. Artifacts land in `e2e/.results`, the HTML report in `e2e/.report`;
both are gitignored and cleared at the start of each run.

In CI, both are uploaded as artifacts on every run, and the `github` reporter annotates failures
directly on the pull request diff.

### Configuration

`support/env.ts` is the single source of truth: it configures both the test process and the server
under test, so the two cannot disagree about the port, the database or the JWT secret. Every value has
an `E2E_`-prefixed environment variable override.

| Variable | Default | |
| --- | --- | --- |
| `E2E_PORT` | `3100` | Port the application under test listens on |
| `E2E_BASE_URL` | `http://localhost:3100` | Where tests point |
| `E2E_MONGODB_URI` | `mongodb://e2e:e2e@127.0.0.1:27018/circles` | Test database |
| `E2E_JWT_SECRET` | `e2e-jwt-secret-not-for-production` | Signs session tokens |
| `E2E_RESET_DATABASE` | `true` | Empty the database before the run |
| `E2E_WEB_SERVER_COMMAND` | `bun run e2e:server` | How to start the server |
| `E2E_ALL_BROWSERS` | unset | Also run Firefox and WebKit |

To run against a server you started yourself, point both at it — they have to agree:

```bash
E2E_BASE_URL=http://localhost:3000 E2E_MONGODB_URI=<that server's mongo> E2E_RESET_DATABASE=false bun run e2e
```

### CI

`.github/workflows/e2e.yml` runs the suite on every pull request to `main`. It uses the same
`docker-compose.e2e.yml` as a local run, so there is one definition of the services rather than two,
and it tests the production build (`next build` then `next start`) rather than the dev server.
