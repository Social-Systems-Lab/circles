# Chat Runtime Note

## Mongo Chat Runtime

Kamooni chat now runs entirely on a Mongo-based backend.

Matrix has been removed as the runtime chat system.

## Messages performance, Milestone 3 production baseline

Read-only production inspection on 26 November 2026 found the `chat-read-state-v2` migration marker complete.
`members` has only the `_id` index. `circles` has no `did` index. The existing chat conversation, membership,
chronological message, read-state, topic read-state, preference, and draft indexes are present.
`chatMessageDocs` has no starter-specific index.

Use these findings to choose which membership, DID lookup, and starter-discovery plans to measure in Milestone 3.
Milestone 1 changes client refresh scheduling and leaves the index catalog untouched.

---

## Legacy Matrix fields

Some database fields remain for compatibility:

matrixRoomId  
matrixNotificationsRoomId  
matrixUsername  
fullMatrixName  

These are legacy metadata and are not used by the current chat runtime.

Future cleanup may remove them once migration is fully complete.
