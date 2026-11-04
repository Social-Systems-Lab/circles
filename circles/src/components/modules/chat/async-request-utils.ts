export type AsyncRequestGate = { inFlight: boolean };

export const runSingleFlight = async (gate: AsyncRequestGate, request: () => Promise<void>): Promise<boolean> => {
    if (gate.inFlight) return false;
    gate.inFlight = true;
    try {
        await request();
        return true;
    } finally {
        gate.inFlight = false;
    }
};

export const deliverAcceptedPollPage = async ({
    isStale,
    publish,
    advanceCursor,
    acknowledge,
    onAcknowledgementError,
}: {
    isStale: () => boolean;
    publish: () => void;
    advanceCursor: () => void;
    acknowledge: () => Promise<void>;
    onAcknowledgementError?: (error: unknown) => void;
}): Promise<boolean> => {
    if (isStale()) return false;

    publish();
    advanceCursor();

    try {
        await acknowledge();
    } catch (error) {
        onAcknowledgementError?.(error);
    }
    return true;
};
