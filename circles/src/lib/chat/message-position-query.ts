import { ObjectId } from "mongodb";
import { getValidMessageDate, type MessagePosition } from "./message-position";

export const buildMessagesAfterPositionQuery = (position: MessagePosition): Record<string, unknown> => {
    const cursorId = new ObjectId(position.id);
    const cursorDate = getValidMessageDate(position.createdAt);
    if (!cursorDate) return { _id: { $gt: cursorId } };
    return {
        $or: [
            { createdAt: { $gt: cursorDate } },
            { createdAt: cursorDate, _id: { $gt: cursorId } },
            { createdAt: { $exists: false }, _id: { $gt: cursorId } },
        ],
    };
};

export const buildMessagesAtOrBeforePositionQuery = (position: MessagePosition): Record<string, unknown> => {
    const cursorId = new ObjectId(position.id);
    const cursorDate = getValidMessageDate(position.createdAt);
    if (!cursorDate) return { _id: { $lte: cursorId } };
    return {
        $or: [{ createdAt: { $lt: cursorDate } }, { createdAt: cursorDate, _id: { $lte: cursorId } }],
    };
};
