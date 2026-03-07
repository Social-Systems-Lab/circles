# Chat Runtime Note

## Mongo Chat Runtime

Kamooni chat now runs entirely on a Mongo-based backend.

Matrix has been removed as the runtime chat system.

---

## Legacy Matrix fields

Some database fields remain for compatibility:

matrixRoomId  
matrixNotificationsRoomId  
matrixUsername  
fullMatrixName  

These are legacy metadata and are not used by the current chat runtime.

Future cleanup may remove them once migration is fully complete.
