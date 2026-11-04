# Onboarding Milestone 3B.2: Mobile registration cards

Milestone 3B.2 connects the pending-registration backend to a signup, email-verification, and password-creation journey. It remains inactive unless all server-side rollout gates are deliberately enabled.

## Completed journey

1. `/signup` uses the current legacy form unless the pending-registration feature gates and coordinated MongoDB routing mode allow the pending journey. The pending form collects a name, email, handle, and server-validated ALTCHA response; it does not collect a password.
2. `/signup/check-email` shows the authorized registration's current destination. Resend and email correction use the pending-registration continuation cookie, backend cooldowns, and distributed rate limits. The UI reflects the server's current email and cooldown rather than assuming every generic response succeeded.
3. `/signup/verify` consumes a single-use verification token, sets a short-lived HttpOnly verified-continuation cookie, and redirects to `/signup/continue` without the token in the resulting URL. The flow works when the email link is opened on another device.
4. `/signup/continue` verifies the continuation capability server-side and displays the password card only when it is still valid. Completion validates the capability, captures the internal redirect, then calls the existing one-use provisioning operation. Provisioning reserves and preserves the DID, creates the permanent account once, finalizes membership and welcome side effects, and establishes the existing authenticated session. Registration-only cookies are cleared after success.

The destination stored with a registration is validated as an internal path. If none is present, completion goes to the existing `/explore` route; no unfinished `/onboarding` route is assumed.

## Safety and compatibility

- `PENDING_REGISTRATION_ENABLED` and `PENDING_REGISTRATION_JOURNEY_READY` remain unset/disabled by default. The MongoDB registration mode defaults to `legacy`; pending mode also requires the deployment-ID consistency check.
- `/signup/check-email` and `/signup/continue` redirect to `/signup` unless the pending gates and routing mode are active. `/signup/verify` independently checks the same controls.
- The legacy signup action, existing-account `/verify-email` route, login, and password recovery remain unchanged.
- Passwords are sent only to the one-time completion action and are not stored in pending-registration records, browser storage, or URLs.
- Preview: `http://localhost:3000/dev/onboarding-preview` in development. The preview route is 404 outside `NODE_ENV=development`; all three cards skip live initialization and action calls in preview mode.

## Recovery limitations

- Expired, consumed, or invalid verified continuations cannot be replayed. Members can sign in if provisioning completed; otherwise the screen directs them to support.
- If provisioning failed before a DID was reserved, the existing pending continuation may request another verification email once the lease/cooldown rules permit. A fresh verification is still required before another password attempt.
- If a DID was reserved but no correlated permanent account can be recovered, the registration fails closed and requires operator reconciliation. The system never generates a replacement DID.
- If the permanent account exists but the browser lost the authenticated session, normal login is required; the consumed continuation does not establish another session.
- Local tests characterize lifecycle, routing, recovery, and card contracts. The disposable MongoDB integration test requires a specifically prefixed isolated test database and was not run when that configuration was unavailable.

## Remaining activation blockers

1. Run the disposable MongoDB integration suite against an isolated database and temporary credential directory.
2. Complete staging end-to-end tests with staging-only mail delivery and test identities. Cover different-device verification, correction/resend throttles, exactly-once provisioning, session establishment, safe redirects, and the reconciliation path.
3. Confirm operators can inspect and reconcile any reserved-DID partial registration before rollout.
4. Coordinate deployment IDs and switch the MongoDB registration mode only after every serving instance has the compatible code. Keep the journey-ready gate off until the full journey is validated; rollback to `legacy` before removing compatible instances.

No staging or production configuration was changed for this milestone. No activation or deployment has occurred.

## Separate future design pass

The current card layouts are the approved functional baseline. Logo/wordmark presentation, broader landing-page consistency, and any additional visual polish are deferred to a separate design milestone. The later introduction, guidelines, location, photo, Proof of Humanity, and celebration steps are not included here.
