# Release Note: Post Sharing With Comments

## User-facing summary

Users can now share an existing noticeboard/feed post into:

- their own profile/feed
- another circle/group where they already have permission to post

A share creates a new post in the destination feed. The user may add an optional comment above the embedded original post preview.

The shared post is its own discussion thread:

- comments and reactions on the shared post belong to the destination feed
- they do not write back to the original post
- the original post remains unchanged and keeps its own separate discussion

## Technical summary

This MVP adds native post sharing rather than duplicating post content.

- Shared posts are stored as normal feed posts.
- The new shared post keeps its own `createdAt`, comments, reactions, and destination `feedId`.
- The link to the original post is stored via `sharedPostId`.
- Rendering shows:
  - optional share comment/content on top
  - embedded original post preview/card below

Preview behavior in this MVP:

- normal shared posts show the original post image preview when available
- shared funding/shadow posts show the funding cover image when available
- shared funding/shadow previews click through to the funding request page, not the shadow noticeboard post
- if the original is unavailable or not viewable, the UI shows `Original post unavailable.`

## Data and model notes

- Post model includes `sharedPostId?: string`.
- Shared posts do not duplicate the original post body or media into the new destination post.
- Hydrated display data may include a resolved embedded preview for the original post.
- Share comment content uses the normal post `content` field and is optional.

## Permission and safety notes

- Creating a share still uses existing post-create permissions for the destination circle/feed.
- Server-side validation checks that:
  - the original post exists
  - the sharing user is allowed to view the original post
  - the sharing user is allowed to post in the destination feed
- Embedded previews must not reveal original content the current viewer is not allowed to see.
- If the original post is deleted, private, or otherwise unavailable, the shared post remains valid and renders the safe unavailable fallback.

## Known MVP limitations

- No share notifications were added.
- No share counts or analytics were added.
- No recursive nested share rendering was added.
- A shared post that references another shared post resolves only one level for display.
- This MVP is limited to sharing existing feed/noticeboard posts, including funding/shadow posts that already render through the feed system.

## Basic test checklist

- Share a normal post to your own profile/feed.
- Share a normal post to a circle/group where you can post.
- Add a comment during share and confirm it renders above the original preview.
- Share without a comment and confirm the embedded preview still renders correctly.
- Confirm comments/reactions on the shared post stay on the shared post only.
- Confirm the original post discussion remains unchanged.
- Confirm normal shared posts show the original image when available.
- Confirm shared funding/shadow posts show the funding cover image when available.
- Confirm shared funding/shadow previews open the funding request page.
- Confirm unavailable or non-viewable originals render `Original post unavailable.`
