# Kamooni Local Dev Stability Checklist

## Why this happened

This was partly related to the reboot, but not because reboots are inherently dangerous.

The actual failure chain was:

- a local Mac `mongod` process started listening on `127.0.0.1:27017`
- Docker Mongo was also listening on port `27017`
- localhost dev sometimes talked to the wrong Mongo instance
- the local database state and auth expectations drifted
- when we reset local Docker Mongo to recover cleanly, your old **local** accounts disappeared because they lived only in the local dev database

So the root issue was **local environment drift**, especially around Mongo listeners and credentials, not Stripe.

---

## Core rule

Before doing serious local testing, confirm that localhost is talking to the Docker services you expect.

---

## Daily quick-start checklist

### 1. Confirm Docker is up

Run:

```bash
cd ~/circles/circles && docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

You want to see at least:

- `circles-circles-1`
- `circles-db-1`
- `circles-minio-1`
- `circles-qdrant-1`

### 2. Confirm only one Mongo is listening on 27017

Run:

```bash
lsof -nP -iTCP:27017 -sTCP:LISTEN
```

Healthy result:

- Docker is listening
- no separate local Mac `mongod` is listening on `127.0.0.1:27017`

If you see a local `mongod`, stop it:

```bash
kill <PID>
```

Then confirm again:

```bash
lsof -nP -iTCP:27017 -sTCP:LISTEN
```

### 3. Confirm your local env file matches your intended dev setup

Check:

```bash
cd ~/circles/circles && sed -n '1,12p' .env.local
```

At minimum verify:

- `MONGODB_URI`
- `CIRCLES_URL`
- `NEXT_PUBLIC_APP_URL`
- Stripe values if testing billing

### 4. Start localhost dev

Run:

```bash
cd ~/circles/circles && npm run dev
```

### 5. Open localhost and verify basic health

Check:

- app loads
- no Mongo auth errors in terminal
- you can log in or sign up
- the page you want to test actually opens

---

## Reboot checklist

After rebooting your Mac:

### 1. Start Docker Desktop fully

Wait until Docker is actually ready.

### 2. Check Mongo port conflicts immediately

Run:

```bash
lsof -nP -iTCP:27017 -sTCP:LISTEN
```

This is the most important reboot check.

### 3. If a local `mongod` reappeared, stop it

```bash
kill <PID>
```

### 4. Then start local dev normally

```bash
cd ~/circles/circles && npm run dev
```

---

## Before testing Stripe locally

### 1. Confirm app URL and webhook forwarding target match the real local port

If Next starts on `3001`, then both must use `3001`:

- `NEXT_PUBLIC_APP_URL=http://localhost:3001`
- Stripe CLI forward target:

```bash
stripe listen --forward-to http://localhost:3001/api/stripe/webhook
```

### 2. Use sandbox Stripe values only

For local testing:

- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...`
- sandbox `price_...` IDs only

Never mix live Stripe values with local dev.

### 3. Leave the Stripe listen terminal running

Do not close it while testing checkout and webhooks.

---

## Safe recovery sequence when localhost breaks

### Problem: app shows Mongo auth error

Run these in order:

```bash
lsof -nP -iTCP:27017 -sTCP:LISTEN
```

If local `mongod` exists:

```bash
kill <PID>
```

Then test Mongo directly:

```bash
mongosh "mongodb://127.0.0.1:27017/circles" --eval "db.serverSettings.findOne()"
```

Then restart dev:

```bash
cd ~/circles/circles && npm run dev
```

### Problem: localhost works but login fails with account missing

This usually means you are on a fresh or different local database.

Options:

- sign up a new local test account
- or restore or import local dev data if you have a backup

### Problem: Stripe checkout fails immediately

Check:

- `sk_test_...` is present in `.env.local`
- `whsec_...` is present in `.env.local`
- `price_...` IDs belong to the same sandbox account as the `sk_test_...` key
- `stripe listen` is forwarding to the correct localhost port

---

## What not to do

- do not assume `127.0.0.1:27017` is always Docker Mongo
- do not use live Stripe keys in local dev
- do not reset local Mongo unless you are okay losing local accounts and local data
- do not change multiple env and infra variables at once without checking the effect

---

## Best-practice operating protocol

### For normal feature work

1. Check Docker
2. Check Mongo port listener
3. Start local dev
4. Test feature
5. Only then make code changes or run migrations

### For billing work

1. Confirm localhost port
2. Confirm Stripe sandbox keys
3. Confirm sandbox price IDs
4. Start `stripe listen`
5. Start local dev
6. Test checkout

### Before any destructive reset

Always ask yourself:

- Is this only local?
- Do I need anything from the local DB first?
- Should I export or snapshot local data before resetting?

---

## Minimal pre-flight command set

Run these before a serious test session:

```bash
cd ~/circles/circles
lsof -nP -iTCP:27017 -sTCP:LISTEN
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
npm run dev
```

For Stripe sessions:

```bash
stripe listen --forward-to http://localhost:3001/api/stripe/webhook
```

---

## Recommendation going forward

Use a dedicated **local test account** in Kamooni for development work.

That way:

- wiping local DB is less disruptive
- Stripe tests stay isolated
- you avoid confusion with older accounts and passwords

---

## Optional future improvements

These would reduce the chance of this happening again:

- add a `make local-check` or script that verifies Mongo listener and Docker health
- add a startup warning if local `mongod` and Docker Mongo are both active
- add a documented local seed account flow
- add a one-command local reset script with an explicit confirmation step
