# Release Note: Curated Default Hero Images

Updated: 2026-05-05

## Summary

Kamooni now assigns a curated default hero image to newly created circles and profile circles when the creator does not upload or select a custom cover image.

This replaces the previous single dull fallback image for new entities with a small library of warmer, more natural default hero images.

## What changed

- Added seven static default hero images under:

  `public/images/default-heroes/`

- Added a default hero helper:

  `src/lib/default-heroes.ts`

- New circles now receive one default hero image at creation time when no custom cover is provided.

- New user/profile circles also receive one default hero image when no custom cover is provided.

- The circle wizard now preserves the assigned default hero between the basic info and profile steps, so it is not overwritten by an empty image array.

- Static default hero images are protected from MinIO deletion logic. Only `/storage/...` upload URLs are sent to MinIO cleanup.

## Important behavior

The selected hero is assigned once and saved in `circle.images`.

It does not randomly change on each page load.

Existing circles and profiles were not migrated. Existing records without cover images may still use the old fallback until updated later.

Custom uploaded cover images continue to take priority.

## Maintenance notes

Default hero image paths use stable relative URLs, for example:

`/images/default-heroes/kamooni-hero-01.webp`

To replace a default hero later, keep the same filename and replace the image file.

To add more default heroes later, add the new static file and update `src/lib/default-heroes.ts`.

Avoid deleting old default hero files unless existing database records have first been checked or migrated, because saved circles may reference those paths.
