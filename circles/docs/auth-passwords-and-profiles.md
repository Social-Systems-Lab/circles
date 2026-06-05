# Auth: Passwords, Profiles, and Reset Flow (Kamooni / Circles)

This document describes where user profile/auth data is stored in production, how password reset works end-to-end, and how to verify behavior safely in MongoDB and logs.

> Scope: Kamooni/Circles stack on DigitalOcean droplet using Docker Compose  
> Repo on droplet: `/root/circles/circles`  
> Services: `circles` (Next.js app), `db` (MongoDB)

---

## 1) Where profiles and auth-related fields are stored (MongoDB)

### 1.1 Primary database and collections

In production, user “accounts” are stored in:

- **Database:** `circles`
- **Collection:** `circles`

Notes:
- `db.users` is empty in production and is **not** the active user store.
- `db.members` contains membership-related documents and does not store user email directly.

### 1.2 Fields we have directly verified exist

In `circles.circles` documents, the following fields have been verified in production:

- `email` (string)
- `isEmailVerified` (boolean)
- `passwordResetToken` (string) — **stored hashed**
- `passwordResetTokenExpiry` (ISODate)

> Do not assume other auth fields (password hash, salt, provider IDs, etc.) without verifying on your environment.

---

## 2) Password reset flow (production)

### 2.1 Trigger: Forgot password page

- Route: `https://kamooni.org/forgot-password`
- Server action source file:
  - `src/app/(auth)/forgot-password/actions.ts`

### 2.2 Preconditions to send email

The server action only sends a reset email if:

- the user exists, **and**
- `user.isEmailVerified === true`

### 2.3 Token creation + storage model (verified behavior)

Observed/confirmed in production:

- The reset email contains a **raw token** in the URL, e.g.  
  `https://kamooni.org/reset-password?token=<RAW_TOKEN>`
- MongoDB stores a **SHA-256 hash** of that raw token in:  
  `passwordResetToken`
- MongoDB stores the expiry timestamp in:  
  `passwordResetTokenExpiry`

This is the intended security model: the raw token is never stored in the database.

### 2.4 Email delivery (Postmark)

Production uses Postmark templates.

Verified from logs:
- Template
- Template alias: `password-reset`
- Postmark returns success with `ErrorCode: 0` and an outbound `MessageID`
- Logs include:
  - “Attempting to send email … using template password-reset”
  - “Email sent successfully … MessageID …”
  - “Password reset email initiated for <email>”

---

## 3) Safe verification procedures (copy/paste)

### 3.1 Inspect reset token fields for an email (production)

Run on droplet shell:

```bash
cd /root/circles/circles && docker compose exec -T db mongosh -u admin -p password --authenticationDatabase admin --quiet circles --eval '
db.circles.findOne(
  { email: "you@example.com" },
  { _id: 0, email: 1, isEmailVerified: 1, passwordResetToken: 1, passwordResetTokenExpiry: 1 }
)
'
```
