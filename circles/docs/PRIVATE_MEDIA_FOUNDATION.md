# Private media foundation

Public media continues to use the anonymously readable `circles` MinIO bucket and `/storage/...` URLs. That behavior is unchanged.

Private media uses the separate `MINIO_PRIVATE_BUCKET` bucket (`circles-private` by default). The application creates this bucket without an anonymous-read policy. A `privateMedia` Mongo record holds the internal object key and trusted ownership metadata; browser URLs contain only the opaque record ID as `/private-media/<mediaId>`.

The private-media route authenticates from the signed application session, applies circle lifecycle policy, and currently permits circle-owned media only to a current member. It returns a neutral 404 for every unavailable or unauthorized case. Conversation-owned records are denied until canonical chat authorization is integrated. Superadmin status alone does not grant access.

No existing upload uses this foundation yet. Secret Circle visibility, server-side public/private selection, private-aware image rendering, moderation grants, and existing-media conversion are later phases.
