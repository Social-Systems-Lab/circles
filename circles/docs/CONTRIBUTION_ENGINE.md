# Contribution Engine — Kamooni

## Overview

The Contribution Engine is the core system that transforms user intent into real-world contributions.

It connects:

- what people can contribute (skills, time, money)
- what the ecosystem needs
- what actually happens

This system evolves Kamooni from a social platform into a coordination and contribution network.

---

## Core Flow

Intent → Measurement → Activation → Contribution → Trust → Allocation

---

## 1. Intent Layer (Current)

Captured during onboarding.

Stored in user document:

donationIntent: {
  amount?: number,
  volunteering?: boolean,
  skipped?: boolean,
  updatedAt: Date
}

Also includes:

- skills
- interests
- project intent

---

## 2. Measurement Layer (Current)

Aggregation function:

- getOnboardingMcpStats()

Produces:

- totalMonthlyContributionPotential (MCP)
- average contribution
- participation rates
- intent distribution

Accessible via:

- Admin dashboard
- CLI script

---

## 3. Activation Layer (Next Step)

Goal: convert passive intent → active behavior

Examples:

- prompt user to contribute to a project
- suggest relevant tasks
- highlight matching needs
- notify users when help is needed

Key idea:

Right prompt, right time, right opportunity

---

## 4. Contribution Layer (Future)

Actual actions:

- donating money
- volunteering time
- completing tasks
- sharing resources

---

## 5. Trust Layer (Future)

Track:

- completed contributions
- reliability
- feedback

Outputs:

- reputation score
- contribution history

---

## 6. Allocation Layer (Future)

Route resources efficiently:

- match donors to projects
- prioritize trusted actors
- enable delegated funding

---

## Key Metrics

- Contribution Rate = contributors / active users
- MCP (Monthly Contribution Potential)
- activation rate
- completion rate

---

## Strategic Role

The Contribution Engine is the economic backbone of Kamooni.

---

## TL;DR

Kamooni turns intention into coordinated action.
