# Peerify Managed Identities

## Purpose

Define the long-term identity direction for Peerify:

- private personal accounts stay personal
- public artist, band, venue, host, and community presence should become managed public identities
- the current Artist Profile MVP is acceptable as a Phase 1 shortcut, but should not become the permanent architecture

This document describes how Peerify can evolve toward managed public identities using the existing Circles model as the foundation.

## Core principle

Peerify should separate:

- the private account of a real person
- the public identity that person creates, manages, or helps operate

In practice:

- login account = human person
- personal profile/circle = the person's private or semi-private home identity
- public Peerify identity = a managed public entity such as an artist, band, venue, host, or community

This separation is important because one person may manage multiple public identities, and one public identity may be managed by multiple real people.

## Why artist profiles should become managed circles

The current Artist Profile MVP stores artist metadata directly on a user profile. That is acceptable for Phase 1 because it is fast, simple, and low-risk.

It should still be treated as a prototype shortcut rather than the final model.

Artist profiles should become managed circles because:

- an artist or band is often a public project, not just a personal account
- bands and collectives may require multiple managers or members
- venues and hosts are clearly not the same thing as a personal profile
- public entities need their own membership, permissions, messaging, trust, and reputation history
- the existing circle infrastructure already provides a strong base for managed public entities

The likely long-term shape is:

- keep personal user circles for individual humans
- create Peerify-specific public circles for artist, band, venue, host, and community identities
- attach Peerify metadata, templates, and workflows to those circles

## Proposed identity types

Peerify should plan for managed public identities such as:

- artist
- band
- venue
- host
- collective/community
- event series or promoter project

These should be public identity types with Peerify-specific metadata, rather than special cases hidden inside a personal account.

## Recommended near-term technical shape

Recommended direction:

- keep the current login/account model unchanged
- keep one personal user circle/profile per human account
- represent future public Peerify identities as managed circles built on the existing circle infrastructure
- add Peerify-specific metadata/templates to distinguish artist, band, venue, host, and related public identity types

Likely structural model:

- human account owns or co-manages one or more public circles
- each public circle has its own About data, images, modules, trust state, and messaging surface
- access is role-based so several verified people can manage the same identity

This is the smallest long-term shape that fits the current architecture instead of fighting it.

## Relationship to the current MVP

The current MVP can continue to store artist metadata on the user profile for now.

That should be treated as:

- Phase 1
- prototype shortcut
- migration-friendly temporary shape

It should not be treated as proof that personal profiles and artist identities are the same thing.

The right framing is:

- today: artist info lives on the user profile so Peerify can move quickly
- later: artist pages become managed public identities, likely implemented as circles with Peerify templates and metadata

## Proposed phases

### Phase 1

- keep artist metadata on the user profile
- keep onboarding and editing simple
- validate demand, language, and core artist use cases

### Phase 2

- introduce managed public identities for artists and bands
- allow a verified person to create or claim a managed artist identity
- allow multiple verified people to manage the same identity
- keep personal account and public artist identity visibly distinct

### Phase 3

- extend managed identities to venues, hosts, and communities
- add role-based permissions for teams
- add identity-specific templates and workflows

### Phase 4

- add richer trust, reviews, live reputation, and public reputation history
- support migration of strong MVP artist pages from personal-profile storage into managed public identities

## Identity templates

Peerify should likely support templates layered on top of circles, for example:

- artist template
- band template
- venue template
- host template
- community template

A template can define:

- required fields
- optional fields
- default modules
- public labels
- trust and verification requirements
- enquiry and booking workflows

Example template differences:

- artist/band
  - genre, location, lineup, recordings, live setup, availability
- venue
  - capacity, address region, backline, sound setup, accessibility, hosting rules
- host
  - home setting, city, guest capacity, food/sleeping options, house rules
- community
  - purpose, membership model, local area, hosted events

## UI implications

The UI should make the identity separation explicit.

Long-term implications:

- account settings should manage the human person's private/personal identity
- Peerify should offer a clear "manage identities" area for public entities
- a person should be able to switch between personal and managed public identities
- public artist/band/venue/host pages should look like public entities, not like personal profiles with extra fields

Useful future UI language:

- Personal account
- Managed identity
- Managed by
- Create artist identity
- Create venue identity

This reduces confusion about who the real person is versus which public identity they operate.

## Messaging and enquiries

Managed identities should eventually have their own messaging/enquiry surfaces.

Examples:

- fans message an artist identity
- hosts send enquiries to an artist or band identity
- artists contact venue or host identities

Important distinction:

- the conversation may be addressed to the public identity
- one or more verified human managers may receive and answer it

This is another reason not to permanently bind public artist presence to a single personal profile.

## Trust and verification

Peerify should not remove Proof of Humanity.

Instead, it should reframe Proof of Humanity as one layer inside a broader Peerify trust system.

Peerify needs trust because:

- artists selling music should be real people or real artist projects
- artists should not be fake profiles selling copied, AI-generated, or stolen music
- fans and hosts need confidence before attending or hosting intimate shows
- hosts and attendees also need trust signals

Recommended trust layers:

1. Human verification
   - "This is a real person."
2. Artist verification
   - "This is a real artist/project/band, and the profile is controlled by the artist or their legitimate team."
3. Live/reputation verification
   - "Peerify members have seen this artist live, hosted them, attended their event, or reviewed a real performance."

Important distinctions:

- a verified person is not automatically a verified artist
- a verified artist identity may be managed by several verified people
- a venue or host identity requires a different type of trust check

Future public trust language for artist/band pages could include:

- Verified artist
- Verified band
- Seen live by Peerify members
- Hosted by Peerify members
- Reviewed after official Peerify gigs

This means Proof of Humanity remains important, but it becomes the personal-human trust layer rather than the whole trust story.

## Open questions

- should managed public identities use the existing circle type with Peerify metadata, or introduce a more explicit subtype model?
- what is the cleanest permission model for multi-person artist/band management?
- when should MVP artist-profile data migrate into managed identities?
- should artist messaging be inbox-based, enquiry-form-based, or both?
- how should public handles work when a person and their artist identity both exist?
- what is the minimum viable verification flow for artist, host, and venue trust?
- which trust signals should be publicly visible at launch, and which should stay internal/moderated first?

## Recommended next step

Keep the current MVP architecture in place, but explicitly design the next Peerify identity layer around managed public circles.

The recommended next step is to produce a short technical follow-up that maps:

- how managed identities would sit on top of the current circle model
- what metadata/templates would be required for artist and band identities first
- what permission model would allow several verified people to manage one public identity
- what migration path would move MVP artist-profile fields off the personal profile when Phase 2 begins
