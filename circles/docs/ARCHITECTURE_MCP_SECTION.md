## Contribution Signal Layer (MCP)

Kamooni captures early-stage economic intent during onboarding via a donation/volunteering prompt.

This data is stored on the user document as `donationIntent` and aggregated into **MCP (Monthly Contribution Potential)**.

MCP represents the total potential monthly contributions users indicate they would make if contribution mechanisms were available.

### Current Implementation

**Storage (User Document)**

```ts
donationIntent: {
  amount?: number,
  volunteering?: boolean,
  skipped?: boolean,
  updatedAt: Date
}
```

### Aggregation

- Function: `getOnboardingMcpStats()`
- Location: `src/lib/data/user.ts`

Calculates:
- `totalUsersWithDonationIntent`
- `usersWithAmount`
- `totalMonthlyContributionPotential`
- `averageMonthlyContributionPotential`
- `volunteeringCount`
- `skippedCount`
- `amountBuckets`

### Access

- Admin dashboard (internal only)
  - `/admin` → Server Settings → Onboarding MCP Summary

- CLI script:
  - `npx tsx scripts/report-onboarding-mcp.ts`

### Purpose

- Measure latent economic potential before payment systems exist
- Validate the contribution-driven model
- Support fundraising and strategic decision-making
- Establish a baseline for the contribution economy

### Strategic Role

This system represents the first layer of Kamooni’s contribution engine:

**Intent → Measurement → Activation → Transactions**

### Future Evolution

- Contribution segmentation
- Activation flows
- Altruistic Wallet integration
- Trust and reputation layer
- Contribution-based personalization
