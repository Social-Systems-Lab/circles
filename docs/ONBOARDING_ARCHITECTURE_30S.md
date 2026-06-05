# Circles / Kamooni — 30-Second Onboarding Architecture

## The shortest useful explanation

Circles / Kamooni is a Next.js app running behind nginx.

### Request flow
- Browser hits `https://kamooni.org`
- nginx routes app traffic to the Next.js container
- nginx routes `/storage/*` to MinIO
- Next.js handles app pages, server actions, API routes, and image optimization

### Main data stores
- **MongoDB** → users, circles, chat, events, memberships
- **MinIO** → uploaded files and images
- **Qdrant** → vector / semantic search
- **Synapse + Postgres** → legacy Matrix stack still present, planned for removal

### Critical architectural rule
A user’s **DID must never change** on password reset.

### Chat
Mongo is the live chat backend:
- `chatConversations`
- `chatRoomMembers`
- `chatMessageDocs`
- `chatReadStates`

### Images
Images are written as absolute URLs into MongoDB **at upload time**, using `CIRCLES_URL`.

If `CIRCLES_URL` is wrong, broken URLs are stored and must be repaired in MongoDB.

### Deploy safety
Use:
- PR → CI → merge
- `./deploy-genesis2.sh main`
- verify with `/api/version`

### Mental model
Think of the platform as:

**Next.js app + Mongo data + MinIO files + nginx front door**

Everything else is either support infrastructure or legacy compatibility.
