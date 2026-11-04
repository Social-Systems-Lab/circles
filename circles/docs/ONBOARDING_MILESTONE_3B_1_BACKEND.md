# Onboarding Milestone 3B.1: Backend-only pending signup

This milestone adds the pending-registration server actions and email verification exchange. It does not include signup cards or password-entry UI.

## Routes and actions

- Existing `/signup` remains the active legacy form.
- `/signup/verify` consumes a pending-registration email token, then redirects to a clean signup URL.
- `/signup/continue` is a gated status placeholder and does not claim registration is complete.
- Existing-account `/verify-email` behavior is unchanged.
- Server actions provide start, resend, email correction, resume and one-use password completion contracts for the forthcoming UI.

## Activation gates

The backend requires all of `PENDING_REGISTRATION_ENABLED=true`, `PENDING_REGISTRATION_JOURNEY_READY=true`, registration routing mode `pending`, and a matching `REGISTRATION_DEPLOYMENT_ID`. All gates default closed for the pending journey. Do not set the journey-ready gate until Milestone 3B.2 supplies a functional end-to-end password completion experience and has passed staging review.

## Verification and recovery

The email link is consumed server-side and exchanged for a short-lived HttpOnly, SameSite=Strict continuation cookie. The clean redirect prevents token persistence in the browser URL. Password completion atomically consumes the verified continuation while claiming the provisioning state. Replays fail. Failures before DID reservation can restart only after resend and fresh email verification; failures after DID reservation retain the identity and require operator reconciliation if no correlated account exists. A completed account with a lost session must use ordinary login.

## Activation blocker

Milestone 3B.2 must implement the signup, check-email and password-creation UI, wire the server actions, and complete browser-level staging tests before `PENDING_REGISTRATION_JOURNEY_READY` can be enabled. No public signup journey is enabled by this milestone.
