# Staging-only captured email

Captured email is test infrastructure for `staging.kamooni.org`. It must remain on the dedicated staging application
branch and staging deployment artifact lineage. It must never be merged into or built from production `main`.

The runtime checks (`EMAIL_TRANSPORT=capture`, `EMAIL_CAPTURE_ENABLED=true`, `KAMOONI_DEPLOYMENT_ENV=staging`, exact
staging URLs, production Node mode, and blank Postmark credentials) are defense-in-depth. Environment variables are not
a cryptographically independent deployment identity: an operator able to replace every environment value could imitate
them. Production protection therefore depends on both source-branch isolation and separate staging artifacts in addition
to the runtime checks.

Captured verification and reset links are credentials. They are available only through the superadmin page, must never
be logged, and expire automatically from the isolated staging collection.
