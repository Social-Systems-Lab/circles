export type MessagePosition = {
    id: string;
    createdAt?: Date | string | null;
};

const validDate = (value?: Date | string | null): Date | null => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

export const compareMessagePositions = (left: MessagePosition, right: MessagePosition): number => {
    const leftDate = validDate(left.createdAt);
    const rightDate = validDate(right.createdAt);
    if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) {
        return leftDate.getTime() - rightDate.getTime();
    }
    return left.id.localeCompare(right.id);
};

export const selectLatestMessagePosition = (positions: MessagePosition[]): MessagePosition | null =>
    positions.reduce<MessagePosition | null>(
        (latest, position) => (!latest || compareMessagePositions(position, latest) > 0 ? position : latest),
        null,
    );

export const getValidMessageDate = validDate;
