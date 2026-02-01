# Chat & Direct Messages (DMs)

## Direct Messages (DMs) and Archiving

Direct Messages are **soft-archived**, not deleted.

### What this means

- When a DM is archived:
  - It is **excluded from DM resolution**
  - It will not be reused automatically when starting a new DM
- The underlying Matrix room is **not deleted**
- Message history remains intact

### Restoring an archived DM

An archived DM can be restored by setting:

archived: false 
on the corresponding `chatRooms` document.

Once restored:
- The room becomes visible again
- Existing message history is preserved
- Matrix membership can be re-established if needed

### Why this exists

This prevents:
- Reusing broken or partially-initialized DM rooms
- Silent failures when Matrix membership drifted
- Data loss from accidental hard deletes

Archiving provides a safe escape hatch while keeping history intact.
