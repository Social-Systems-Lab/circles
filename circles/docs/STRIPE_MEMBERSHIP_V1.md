# Stripe Membership v1

## Overview

Kamooni now supports Stripe-based memberships in the main app.

This implementation adds:

- Stripe Checkout session creation for monthly and yearly memberships
- Stripe Customer Portal access for managing billing and cancellation
- Stripe webhook handling for membership activation and updates
- Kamooni-side membership state persistence in MongoDB
- membership UI in Account Settings
- informational membership side panels in the subscription settings UI

The system is designed so that **Kamooni remains the source of truth** for membership state, while Stripe is the billing provider.

---

## Stripe products and prices

Current Stripe price IDs in production:

- Monthly: `price_1TNZDeBxePB3GpzCjOqOdNS9`
- Yearly: `price_1TNZEvBxePB3GpzCZB8yX6fx`

Current pricing:

- `€5/month`
- `€50/year`

Yearly pricing is `€10` less than paying monthly for twelve months.

---

## Main files

### Stripe helper

- `src/lib/stripe.ts`

Responsibilities:

- initialize Stripe server client
- read Stripe price IDs from environment
- build app base URL for success/cancel redirects

### Membership data helper

- `src/lib/data/membership.ts`

Responsibilities:

- look up users by email / Stripe customer ID / Stripe subscription ID
- write Stripe membership fields to MongoDB
- avoid wiping previously stored Stripe fields when a later webhook omits them
- record processed webhook events for idempotency

### API routes

- `src/app/api/stripe/create-checkout-session/route.ts`
- `src/app/api/stripe/create-portal-session/route.ts`
- `src/app/api/stripe/webhook/route.ts`

### UI

- `src/app/circles/[handle]/settings/subscription/subscription-form.tsx`
- `src/app/membership/success/page.tsx`

---

## Environment variables

Production and local environments need:

```env
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_MONTHLY=price_1TNZDeBxePB3GpzCjOqOdNS9
STRIPE_PRICE_YEARLY=price_1TNZEvBxePB3GpzCZB8yX6fx
NEXT_PUBLIC_APP_URL=https://kamooni.org
```

Local development uses sandbox values:

- `sk_test_...`
- `whsec_...`
- sandbox `price_...` IDs

Production uses live values:

- `sk_live_...`
- production webhook signing secret
- production `price_...` IDs

---

## Membership data stored on users

Stripe membership data is stored in the user circle document under `subscription`.

Fields added or used by this implementation include:

- `subscription.provider`
- `subscription.stripeCustomerId`
- `subscription.stripeSubscriptionId`
- `subscription.stripePriceId`
- `subscription.stripeCheckoutSessionId`
- `subscription.status`
- `subscription.membershipState`
- `subscription.membershipSource`
- `subscription.membershipExpiresAt`
- `subscription.membershipGraceUntil`
- `subscription.stripeCurrentPeriodEnd`
- `subscription.cancelAtPeriodEnd`
- `subscription.amount`
- `subscription.currency`
- `subscription.interval`
- `subscription.startDate`
- `subscription.lastPaymentDate`
- `subscription.lastWebhookEventId`

Associated user-level flags used by the UI:

- `isMember`
- `isVerified`

---

## Membership state model

Kamooni uses its own membership state model instead of trusting Stripe UI state directly.

Used states include:

- `inactive`
- `active`
- `grace_period`
- `cancelled`
- `past_due`
- `unpaid`

### Intended behavior

- successful payment activates membership
- cancellation should not immediately remove access while the paid period is still active
- failed payments can move a member into grace or past-due states
- Kamooni decides whether a user is treated as a member based on stored membership state

---

## Webhook events handled

Current Stripe webhook route handles:

- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

### Notes

- `checkout.session.completed` stores early Stripe linkage data
- `invoice.paid` is the main activation event for paid membership
- `customer.subscription.created` and `customer.subscription.updated` fill in recurring subscription metadata
- `customer.subscription.deleted` preserves paid-through access where appropriate
- processed events are written to `stripeWebhookEvents` for idempotency

---

## Webhook idempotency

Processed webhook events are recorded in:

- `stripeWebhookEvents`

This prevents duplicate processing when Stripe retries delivery.

Stored fields currently include:

- `eventId`
- `eventType`
- `processedAt`

---

## UI behavior

### Subscription settings page

The subscription settings UI now includes:

- Free card
- Kamooni Membership card
- side-panel explanation for volunteering membership
- side-panel explanation for paid membership
- Stripe portal access for paid members

### Current membership UX

Free card:

- explains free participation
- points users to volunteering membership
- opens a side-panel with more detail

Member card:

- explains paid membership
- opens a side-panel with benefits and join actions
- uses equal-weight monthly and yearly buttons
- for active paying members, shows clear access to Stripe settings

### Stripe portal access

For active Stripe members, the UI now clearly states that they can:

- update their plan
- update payment details
- cancel membership in Stripe

This is intentional and should remain easy to access.

---

## Important implementation notes

### 1. Kamooni is the source of truth

Do not build future membership UI around Stripe status alone.

Membership display should be driven by Kamooni-stored values such as:

- `isMember`
- `subscription.membershipState`
- `subscription.membershipExpiresAt`

### 2. Do not show active-management UI too early

A user may have:

- `subscription.provider = "stripe"`
- `subscription.stripeCustomerId`

without actually having an active membership yet.

The UI should only expose management actions when the user is actually in an active or grace-period membership state.

### 3. Do not overwrite stored Stripe fields with missing values

Some webhook payloads omit fields that were provided by earlier events.

The membership update helper must preserve previously stored values when later events do not include them.

### 4. Webhook signing secret must match the active Stripe listener

During local development, webhook failures were caused by mismatched `STRIPE_WEBHOOK_SECRET` values.

If using `stripe listen`, always update `.env.local` to the **current** `whsec_...` value printed by the running listener.

---

## Local development notes

### Typical local stack requirements

- Docker Mongo running
- no conflicting local Mac `mongod` bound to `127.0.0.1:27017`
- local app port must match Stripe forwarding target
- Stripe CLI listener must point to the actual local port in use

### Typical local Stripe workflow

1. Start Kamooni locally
2. Start Stripe listener

```bash
stripe listen --api-key sk_test_... --forward-to http://localhost:3001/api/stripe/webhook
```

3. Put the current `whsec_...` into `.env.local`
4. Restart local app
5. Test checkout
6. Inspect Mongo user record and `stripeWebhookEvents` if needed

### Common local failure mode

If subscription checkout works but webhook processing fails:

- verify `STRIPE_WEBHOOK_SECRET`
- verify listener is using the same Stripe account as the app's `sk_test_...`
- verify forwarded port matches the running app port

---

## Production deployment notes

Production is currently deployed from:

- `/root/circles/circles/circles`

Standard rebuild command:

```bash
cd /root/circles/circles/circles
git pull --ff-only origin main
docker compose up -d --build circles nginx cron
```

### Important production note

Stripe env vars must exist in the production `.env`.

Without them, checkout will fail with configuration errors such as:

- `STRIPE_SECRET_KEY is not configured`

---

## Known future improvements

Not required for v1, but likely next steps:

- temporal membership indicators in the card
  - next billing date for paying members
  - target hours / progress for volunteering members
- FAQ links from the side panels
- stronger typography and emphasis inside the side panels
- Stripe branding cleanup if any old Donorbox identity remains in Checkout
- explicit volunteer-membership data model and tracking if volunteer membership is activated in-app

---

## Summary

Stripe Membership v1 is now live and covers the full essential flow:

- user opens Stripe Checkout
- Stripe webhooks update Kamooni membership state
- Kamooni stores membership details in MongoDB
- active members can open Stripe Customer Portal to manage or cancel
- UI reflects Kamooni membership state rather than raw Stripe status alone

This is the current baseline implementation for Kamooni paid membership.
