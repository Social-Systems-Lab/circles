# Kamooni — Questionnaire Data Persistence (Foundation for Contribution Engine)

Last updated: 2026-03-17

## Purpose

We just added a new onboarding step that captures contribution intent:

- donation amount (preset or custom)
- volunteering option
- skip option

The next step is to persist this data in Mongo with the smallest safe change.

This is the first foundation for the future Contribution Engine.

---

## Recommendation

Store the data on the existing user document, not in a separate collection.

Why:

- minimal schema change
- naturally idempotent via `$set`
- no duplicate writes
- easy to query later for matching
- avoids premature complexity

---

## Proposed schema

Add an optional field on the user document:

```ts
donationIntent?: {
  amount: number | null;
  volunteering: boolean;
  skipped: boolean;
  updatedAt: Date;
};
```

Notes:

- `amount` is `null` when skipped or not provided
- `volunteering` is a simple boolean for now
- `skipped` makes the user’s choice explicit
- `updatedAt` lets us know the latest submission time

Do not add history, analytics, or a separate event model yet.

---

## Collection design

### Recommended

Store `donationIntent` on the existing user collection/document.

### Do not do yet

Do **not** create a separate collection unless we later need:

- intent history
- repeated submissions as events
- analytics over time
- multi-record preference modeling

For the current phase, the product question is:

> What is this user currently open to contributing?

That belongs on the user document.

---

## Persistence design

Use a server action that updates the authenticated user document with `$set`.

### Action behavior

- authenticate user
- normalize incoming values
- write `donationIntent` with `$set`
- return success/failure
- safe to submit multiple times

### Idempotency

Idempotency comes from replacing the same field on the same user document.

No inserts.
No duplicate rows.
No separate collection.

---

## Normalization rules

Use these rules before writing:

- invalid amount → `null`
- empty amount → `null`
- `skipped = true` → `amount = null`
- `volunteering` coerced to boolean
- always update `updatedAt`

---

## Stored Mongo shape

Example:

```json
{
  "did": "did:key:abc123",
  "handle": "tim",
  "donationIntent": {
    "amount": 10,
    "volunteering": true,
    "skipped": false,
    "updatedAt": "2026-03-17T11:30:00.000Z"
  }
}
```

Skip example:

```json
{
  "donationIntent": {
    "amount": null,
    "volunteering": false,
    "skipped": true,
    "updatedAt": "2026-03-17T11:31:00.000Z"
  }
}
```

---

## Implementation plan

### 1. Add type

Add a small optional `donationIntent` type to the existing user/profile type definition.

### 2. Add Mongo helper

Create or extend the existing user data helper with a function that does:

```ts
$set: {
  donationIntent: normalized
}
```

### 3. Add server action

Create a server action such as:

```ts
saveDonationIntentAction()
```

It should:

- resolve authenticated user
- call the Mongo helper
- return `{ success: true }` or an error result

### 4. Wire into onboarding step

At onboarding `stepIndex 5`:

- call the server action when the user continues
- only advance after successful save
- show a simple error state on failure

---

## Minimal coding target

### Type

```ts
export type DonationIntent = {
  amount: number | null;
  volunteering: boolean;
  skipped: boolean;
  updatedAt: Date;
};
```

### Helper contract

```ts
saveDonationIntentForUser(userDid: string, input: {
  amount: number | null;
  volunteering: boolean;
  skipped: boolean;
})
```

### Server action contract

```ts
saveDonationIntentAction(input: {
  amount?: number | null;
  volunteering?: boolean;
  skipped?: boolean;
})
```

---

## Codex-ready implementation prompt

```md
Title: Persist onboarding donationIntent to Mongo (minimal, idempotent)

Context:
- Repo: ~/circles/circles
- Main repo is the source of truth
- All code changes must end in ~/circles/circles, not remain in a .codex worktree
- Follow workflow: inspect first, make smallest safe change, test locally, commit, push
- After finishing, copy any edited files back to ~/circles/circles if needed and verify with:
  git status --short

Read first:
- current onboarding files
- current user data access layer
- current auth/user lookup helpers
- any dev docs that describe onboarding or user persistence

Task:
We just added a new onboarding step that captures contribution intent:
- donation amount (preset or custom)
- volunteering option
- skip option

Implement minimal Mongo persistence for this data.

Requirements:
1. Store the data on the existing user document, not a separate collection
2. Add an optional field:
   donationIntent: {
     amount: number | null,
     volunteering: boolean,
     skipped: boolean,
     updatedAt: Date
   }
3. Add a minimal Mongo helper that updates this field with $set
4. Add a server action to persist donationIntent for the authenticated user
5. Integrate the action into the onboarding flow at stepIndex 5 so the data is saved before advancing
6. Ensure idempotency: repeated submissions must overwrite the same field, not create duplicates
7. Do not overengineer:
   - no history table
   - no analytics pipeline
   - no extra collection
   - no broad refactor

Implementation guidance:
- Reuse existing auth/user lookup patterns already in the repo
- Reuse existing onboarding action patterns if present
- Normalize inputs safely:
  - invalid or empty amount => null
  - skipped=true => amount=null
  - volunteering coerced to boolean
- Keep types minimal and consistent with current repo style

Please do:
1. Inspect the relevant files first and identify the correct files to edit
2. Make the smallest safe patch
3. Show the exact diff before commit
4. Test locally on localhost
5. Report:
   - files changed
   - where the new field is stored
   - how the action is wired into onboarding
   - where the edited files are located
6. Commit on a feature branch with a clear commit message

Workflow:
1. Create a feature branch
2. Apply changes locally
3. Test locally
4. Commit
5. Push branch
6. Merge locally into main only after validation
7. Final verification in ~/circles/circles with:
   git status --short

After coding, provide:
- exact git commands for me to run
- exact localhost verification steps
- exact Mongo verification command
- brief rollback note
```

---

## Git workflow

### Create feature branch

```bash
cd ~/circles/circles
git checkout main
git pull origin main
git checkout -b feature/donation-intent-persistence
```

### After code changes and local validation

```bash
cd ~/circles/circles
git status --short
git add .
git commit -m "Persist onboarding donation intent to Mongo"
git push -u origin feature/donation-intent-persistence
```

### Merge after validation

```bash
cd ~/circles/circles
git checkout main
git pull origin main
git merge --ff-only feature/donation-intent-persistence
git push origin main
```

---

## Verification steps

### UI

On localhost:

1. Go through onboarding
2. At step 5 test:
   - preset donation
   - custom donation
   - volunteering only
   - skip
3. Confirm onboarding continues normally
4. Re-submit with a different value if possible
5. Confirm there are no duplicate records, only an updated field

### Mongo

```bash
cd ~/circles/circles
docker compose exec -T db mongosh -u admin -p password --authenticationDatabase admin --quiet <<'JS'
const d = db.getSiblingDB("circles");
const user = d.getCollection("circles").findOne(
  { handle: "<HANDLE>" },
  { projection: { handle: 1, did: 1, donationIntent: 1 } }
);
printjson(user);
JS
```

Replace `<HANDLE>` with the test user handle.

Expected shape:

```json
{
  "handle": "...",
  "did": "...",
  "donationIntent": {
    "amount": 10,
    "volunteering": true,
    "skipped": false,
    "updatedAt": "..."
  }
}
```

### Idempotency test

Submit step 5 again with different values, then rerun the same Mongo query.

Expected:

- same user document
- one `donationIntent` field
- updated values
- no duplicate records

---

## Future note

This data is intentionally modeled as a simple current-state field.

Later, it can power a Contribution Engine that matches users to:

- volunteering opportunities
- donation requests
- project needs
- community contribution flows

Possible future extensions:

```ts
donationIntent?: {
  amount: number | null;
  frequency?: "monthly" | "once" | null;
  volunteering: boolean;
  skillsOpenToShare?: string[];
  causes?: string[];
  skipped: boolean;
  updatedAt: Date;
};
```

Not yet.
Keep this version minimal.
