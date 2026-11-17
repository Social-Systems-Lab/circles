# Kamooni — Living Development Roadmap

**Version 1.3 · 17 November 2026**  
**Master backlog and decision register** · Migrated from the approved `Kamooni_Living_Development_Roadmap_v1_3.docx`.

> **North star:** Make Kamooni reliable, intuitive and useful for early communities. Prioritise working discovery, safe participation and trustworthy contribution records before complex extensions, on the path toward the first 1,000 active users.

## Maintaining this roadmap

Every ticket has a stable ID. **Do not reuse IDs.** Update status through **Candidate → Design/Ready → In progress → In review → Done**. Add an owner, GitHub Issue link, evidence and decisions as tasks progress. **Ready** means sufficiently scoped for an initial development ticket, *not* that technical feasibility is validated. The planning statuses below are carried over from version 1.3 and have not been verified against the deployed code.

**Priority guide:** P0 = critical malfunction, security/data loss or broken core entry point; P1 = essential early-user functionality; P2 = useful operational/UX enhancement; P3 = future or lower urgency. Work may be parallelised and small fixes may be expedited.

## Delivery sequence

| Batch | Focus | Work |
| --- | --- | --- |
| 1 | Protect and repair | A09, A02, A03, A01, A04, C01; evaluate G03 |
| 2 | Restore discovery | A05, A06, C10; review G01/G04 |
| 3 | Daily communication | A08, C02, C04, C05, C08 |
| 4 | Circle administration | B01–B05; review G02 |
| 5 | Contribution recognition | D01–D03, after permissions/completion/privacy decisions |
| 6 | Coordination | E01, E02, A07 |
| 7 | Polish | B07–B09, C06–C09, F01; review G05/G06 |
| 8 | Community capabilities | B06, C03, D04, F02; O01–O04 subject to design |
| 9 | Extensions | E03, E04, D05, F03, F04; R01–R03 and U01–U03 after groundwork |
| Early exploration | Video feasibility | V01 in parallel with batches 1–3, without displacing P0 repairs |
| Medium term | Shared resources | R01–R03 extend Offers and require stable discovery |
| Medium term | Item-based project funding | U01–U03 before integrated payments |
| Longer term | Integrated capabilities | U04; V02–V04 |

**Quick win:** F02 external Donate button can be brought into batches 2–3. A working backup/recovery path should not be held up by frontend repairs.

## Ticket catalogue

### A. Stability, security and discovery

| ID | Pri. | Task | Acceptance outcome | Status | Batch / horizon |
| --- | --- | --- | --- | --- | --- |
| **A01** | P0 | Automated backups and recovery | Scheduled database and asset backups, secure off-site retention, alerts and tested restore | Ready | 1 |
| **A02** | P0 | Restore About content | Investigate missing profile/Circle About text, restore display, verify stored data | Ready | 1 |
| **A03** | P0 | Fix Explore double-search | Results load on first search and after returning to Explore | Ready | 1 |
| **A04** | P0 | Audit task/shift permissions | Server-enforced roles for creation, editing, assignment and deletion | Ready | 1 |
| **A05** | P1 | Fix Skills/Offers/Needs matching | Show visitors' matching Offers and Skills against profile/Circle Needs, including left panel | Ready | 2 |
| **A06** | P1 | Restore personal Circles on profiles | Display followed, joined and administered Circles respecting visibility | Ready | 2 |
| **A07** | P1 | Fix SDG selection | Selection persists, purpose clearly explained | Ready | 6 |
| **A08** | P1 | Auto-refresh notifications | New notifications and unread counts without manual refresh | Ready | 3 |
| **A09** | P0 | Fix People pill and audit all Pills | People pill returns people; check filters, states, navigation for every Pill | Ready | 1 |

### B. Circles and administration

| ID | Pri. | Task | Acceptance outcome | Status | Batch / horizon |
| --- | --- | --- | --- | --- | --- |
| **B01** | P1 | Prominent Draft Circle banner | Draft status across hero plus Publish action for authorised user | Ready | 4 |
| **B02** | P1 | Admin access to draft Circles | Appropriate admins can discover and review drafts awaiting approval | Ready | 4 |
| **B03** | P1 | Simplify Circle admin assignment | Secure intuitive add/remove admin flow | Ready | 4 |
| **B04** | P1 | Persistent Info/Settings access | Controls reachable across Circle views and screen sizes | Ready | 4 |
| **B05** | P1 | Post as person or Circle | Authorised noticeboard poster chooses identity, correct avatar and attribution after editing | Ready | 4 |
| **B06** | P2 | Members versus Followers model | Followers tune in, members participate; specify permissions and implement | Design | 8 |
| **B07** | P2 | Access Rules unsaved state | Clearly distinguish pending changes and confirm save | Ready | 7 |
| **B08** | P2 | Immediate module toggles | Apply changes without reload and handle errors | Ready | 7 |
| **B09** | P2 | Edit hero from home view | Admin updates Circle hero directly with permission | Ready | 7 |

### C. Communication and notifications

| ID | Pri. | Task | Acceptance outcome | Status | Batch / horizon |
| --- | --- | --- | --- | --- | --- |
| **C01** | P0 | Autosave unfinished posts | Recover after navigation/reload; auto-drafts at least seven days, explicit drafts persist | Ready | 1 |
| **C02** | P1 | Follow Back notification | New follower notice includes actionable Follow Back | Ready | 3 |
| **C03** | P1 | Email notifications | Preferences and unsubscribe for events, invites and key updates | Ready | 8 |
| **C04** | P1 | Unread markers in topics | Show unread topics and first unread message | Ready | 3 |
| **C05** | P1 | Text and image in same message | Compose and render combined media and text | Ready | 3 |
| **C06** | P2 | Improve first-message topics | Separate initial message from topic description; sensible default title | Design | 7 |
| **C07** | P2 | Unify message icons | Consistent messaging icon meanings | Ready | 7 |
| **C08** | P2 | Correct following wording | Use accurate 'following' wording instead of misleading 'access to' | Ready | 3 |
| **C09** | P2 | Pinned Circle welcome message | Admin pins a welcome message in community area | Ready | 7 |
| **C10** | P2 | Readable URLs in About | Readable clickable URLs in About views | Ready | 2 |

### D. Profiles and contributions

| ID | Pri. | Task | Acceptance outcome | Status | Batch / horizon |
| --- | --- | --- | --- | --- | --- |
| **D01** | P1 | Resolved issues become contributions | Verified completed task produces contribution record subject to visibility and consent | Design | 5 |
| **D02** | P1 | Contribution checkbox on tasks/shifts | Public task/shift eligibility checked by default; creator can uncheck | Design | 5 |
| **D03** | P1 | Contribution privacy rules | Private work never automatically public, contributor visibility respected | Design | 5 |
| **D04** | P1 | Share profile URL | One-tap copy/share of public profile | Ready | 8 |
| **D05** | P3 | Digital calling card | Opt-in profile fields, personal QR, printable image | Future | 9 |

### E. Tasks, shifts and calendar

| ID | Pri. | Task | Acceptance outcome | Status | Batch / horizon |
| --- | --- | --- | --- | --- | --- |
| **E01** | P1 | Multiple task assignees | Assign several contributors with defined ownership and completion | Ready | 6 |
| **E02** | P2 | Bulk manage overdue tasks | Admin bulk select/archive in clipboard with confirmation before deletion | Ready | 6 |
| **E03** | P3 | Bookable resources in calendar | Rooms, couches, vehicles and similar bookable without conflicting slots | Future | 9 |
| **E04** | P3 | Apple Calendar integration | Start with export/subscription, define sync direction before building | Future | 9 |

### F. Interface and growth

| ID | Pri. | Task | Acceptance outcome | Status | Batch / horizon |
| --- | --- | --- | --- | --- | --- |
| **F01** | P2 | Remove natural globe from current Explore | Classic map default, retain natural globe for video meetings | Ready | 7 |
| **F02** | P2 | External Donate button (quick win) | Circle/project admins set validated HTTPS external crowdfunding, PayPal or similar link; clear handoff, edit/remove; no payment handling by Kamooni | Ready | Quick win 2–3 |
| **F03** | P3 | Extend landing-page statistics | Consider published Offers/Needs figures once definitions agreed | Future | 9 |
| **F04** | P3 | Remove landing-page corner links | Remove top-left and top-right links, check mobile layout | Ready | 9 |

### G. Recommended operational gaps (candidate, not confirmed bugs)

| ID | Pri. | Task | Acceptance outcome | Status | Batch / horizon |
| --- | --- | --- | --- | --- | --- |
| **G01** | P1 | First-time user journey audit | Test signup to profile to discovery to follow to Circle to first action | Candidate | 2 |
| **G02** | P1 | Circle invitation workflow audit | Invite registered/unregistered users, redirect to intended Circle after signup | Candidate | 4 |
| **G03** | P1 | Monitoring and regression readiness | Error tracking, smoke tests, staging and rollback playbook | Candidate | 1 |
| **G04** | P1 | Mobile usability audit | Test Pills, map, messaging, Circle tools and onboarding on phones | Candidate | 2 |
| **G05** | P2 | Helpful empty states | Explain zero results, suggest next step | Candidate | 7 |
| **G06** | P2 | In-app feedback and bug reports | Simple report flow with page context and privacy controls | Candidate | 7 |
| **G07** | P2 | Privacy and visibility clarity | Explain public, follower, member and private sharing settings | Candidate | 5 |
| **G08** | P2 | Community moderation baseline | Reporting, removal/response, auditability and abuse safeguards | Candidate | 8 |

### O. Offers and the Kamoonity

| ID | Pri. | Task | Acceptance outcome | Status | Batch / horizon |
| --- | --- | --- | --- | --- | --- |
| **O01** | P1 | Create granular Offers | Specific items, services or help: couch, meal, ride, equipment, mentoring; distinct from Skills | Design | 8 |
| **O02** | P1 | Discover Offers through map Pills | Opt-in anonymous public pins at approximate areas, filter by category | Design | 8 |
| **O03** | P1 | Safe private Offer enquiries | Enquire without publicly exposing owner or exact contact/address | Design | 8 |
| **O04** | P2 | Offer creation during onboarding | Optional prompt: What have I got to offer to the Kamoonity? | Design | 8 |

### R. Resource mapping and shared assets

| ID | Pri. | Task | Acceptance outcome | Status | Batch / horizon |
| --- | --- | --- | --- | --- | --- |
| **R01** | P2 | Resource listing model | Item, condition, quantity, availability, donation/loan terms, owner visibility and approximate area | Design | Medium |
| **R02** | P2 | Resource map and filters | Opt-in discoverability by category, location and donation/loan status; private addresses | Design | Medium |
| **R03** | P2 | Private enquiries and fulfilment | Request/reservation, avoid double booking, private handover and return | Candidate | Medium |

### U. Integrated project funding and itemised needs

| ID | Pri. | Task | Acceptance outcome | Status | Batch / horizon |
| --- | --- | --- | --- | --- | --- |
| **U01** | P2 | Itemised project needs | Project managers list item, quantity, target cost, urgency, justification and fulfilment status | Design | Medium |
| **U02** | P2 | Match needs to existing Offers/resources | Surface in-kind support before purchases, track partial fulfilment | Candidate | Medium |
| **U03** | P2 | Support a specific item | Per-item funding progress, contributions, status, receipts; may start with external provider | Design | Medium |
| **U04** | P3 | Fully integrated payment and disbursement | Scope provider, eligibility, custody, refunds, fraud, compliance and audit trail | Research | Longer |

### V. Kamooni video conferencing

| ID | Pri. | Task | Acceptance outcome | Status | Batch / horizon |
| --- | --- | --- | --- | --- | --- |
| **V01** | P1 | Early video meeting feasibility spike | Evaluate LiveKit/comparable solutions, auth, privacy, bandwidth, device support, costs and minimal prototype with go/no-go brief | Research | Explore early |
| **V02** | P3 | Circle-based meeting MVP | Create/join meetings, guests, audio/video, sharing, host controls and low-bandwidth option | Candidate | Longer |
| **V03** | P3 | Globe-based meeting context | Optional natural globe with consenting participants' broad location and time/day-night, not exact coordinates | Candidate | Longer |
| **V04** | P3 | Meeting integration and sustainability | Circle events, invites, notes/tasks, stored context, usage controls or shared meeting credits | Candidate | Longer |

## Offers — concept and privacy guardrails

**“What have I got to offer to the Kamoonity?”** People can share practical, granular help—such as a couch for a night, a meal, a ride, tools, workspaces, equipment or hours of assistance. An **Offer** is specific and actionable, unlike a general **Skill**. For example: Skill = “I can repair bicycles”; Offer = “I can repair two bicycles this Saturday”; Need = assistance requested. Matchmaking can connect the three, subject to independent publication choices.

**Proposed minimal Offer fields:** Category, short title, plain-language description, general area/service radius, availability or expiry, optional capacity/quantity, conditions, preferred enquiry method, visibility and active/paused/completed state. Avoid collecting identifying details for public display.

**Map and Pill behaviour:** Opt-in anonymous discovery pins, category filtering and coarse locations; no exact home address or giver identity on public pins. Consider location displacement or aggregation. The member must be able to hide an Offer from the map.

**Private enquiry and safety:** In-platform enquiries, identity/contact disclosure only by mutual agreement, reporting/blocking, expiry/pause controls, and extra precautions for overnight stays and rides. Public anonymity should not prevent abuse prevention.

**Open questions:**
- Should Offers be owned by people, Circles or both?
- What location granularity is selectable?
- Is map anonymity default, and can the author choose to reveal identity?
- Do enquiries use existing messages or a separate flow?
- How should fulfilled Offers become contributions without exposing private logistics?
- Should anonymous Offers be public, member-only or restricted to particular Circles?

**Onboarding suggestion:** Present three optional first actions: **Find your people**, **Join a Circle**, **Share something you can offer**. Make it clear that small contributions count, and nothing needs to be public by default.

## Intermediate and longer-term roadmap

### R. Resource mapping
Offers extend into resources that can be **donated**, **lent** or temporarily shared. Record item condition, quantity, availability and terms. Use approximate map discovery and private handovers. A resource is the asset; an Offer is the actionable invitation to share it.

### U. Itemised funding
Project managers list concrete materials, equipment, services or other purchasable needs. Users contribute toward individual items; project pages show progress, fulfilment and evidence such as receipts. Match in-kind Offers/resources first to avoid unnecessary purchases. **F02** is the short-term bridge: an external Donate button pointing to crowdfunding, PayPal or equivalent. Full payment processing requires custody, fraud, refund, disbursement and compliance design.

### V. Video conferencing
Explore technical feasibility early (V01), potentially using **LiveKit**, with attention to Kamooni login, Circle permissions, costs, bandwidth, accessibility, privacy and browser/mobile compatibility. Production Circle meetings are a longer-term undertaking. The **natural globe** is reserved for optional meeting context (consenting participants' approximate places, local times and day/night), not current Explore navigation. Later explore invites, tasks, notes and shared meeting credits.

## Decision register

| Topic | Current decision or unresolved question |
| --- | --- |
| Members versus Followers | Followers tune in; Members participate. Detailed rights remain to be defined. |
| Contributions | Public task/shift eligibility checked by default; privacy and contributor consent override default. |
| Resolved issues | Can count as contributions after verified completed work. |
| Draft recovery | Auto-save substantially written content; recover short-lived automatic drafts and persist deliberately saved drafts. |
| Overdue tasks | Prefer archive to irreversible deletion; bulk action from toolbox/clipboard. |
| Map | Classic map is standard; natural globe reserved for potential video conferencing. |
| Public Offers | Anonymous/approximate on map, publication and identity disclosure controlled by author. |
| Offer fulfilment | Contribution tracking must not disclose private logistics. |
| F02 external Donate | External HTTPS links only, configured by authorised Circle/project admins; no on-platform payment handling. |
| Funding | Clarify beneficiaries, disbursement, overfunding, refunds, unavailable items and purchase evidence. |
| Resource sharing | Decide person/Circle ownership and terms of loan/donation/temporary access. |
| Video | Confirm prototype scope, recording and consent, retention, moderation, accessibility, cost model and potential separate commercial offering. |

## Deferred and completed

| Item | Disposition |
| --- | --- |
| Topics: date info in settings | Done |
| Drag-and-drop in messages | Done |
| Pin direct / bookmarks / note to reply | Discarded for now |
| Show interest in help | Deferred; reconsider after A05 |
| Settings–Info / Members + info | Needs clarification |
| Follow-notification frequency options | Future consideration |

## Next review checklist

- [ ] Triage P0 bugs, especially People pill, with reproductions/logs.
- [ ] Verify backups, restoration and integrity of missing About content.
- [ ] Check whether operational candidates G01–G04 already exist.
- [ ] Compare Peerify's Offers model with Kamooni Skills/Needs.
- [ ] Agree anonymous Offer location defaults before map publication.
- [ ] Assign owner and GitHub Issue link to chosen first-cycle tasks.
- [ ] Review ticket statuses with developer team regularly.
- [ ] Scope V01 video prototype and appoint technical owner.
- [ ] Decide how resource Offers connect to project item needs.
- [ ] Document funding provider, refund and receipt rules before integration.
- [ ] Confirm F02 placement, eligibility, URL validation and external-link behaviour.

---

**Maintenance convention:** Change tickets by editing this file in a pull request; retain IDs; use Git history for versioning rather than creating multiple master documents. This migration preserves the v1.3 backlog and its strategic sections; subsequent updates belong here.
