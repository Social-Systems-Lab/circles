## User Lifecycle

User lifecycle stages:

1. Signup
2. Onboarding
3. Activation
4. Verification
5. Contribution

### Onboarding signals collected

- skills
- interests
- location
- builder status
- project description

### Profile completeness

Profile completeness is used to guide users toward verification readiness.

Suggested thresholds:

- 0–30% → basic account
- 30–70% → contributor
- 70–100% → eligible to verify profile

### Verification

Verification is distinct from paid membership.

Verification should unlock higher-trust interaction capabilities such as:

- joining circles
- messaging members
- posting updates
- collaborating on projects

Recommended gate:

- `profileCompleteness >= 70`

### Activation metric

A user is considered activated when they complete at least one of:

- follow a circle
- offer a skill
- post an introduction
