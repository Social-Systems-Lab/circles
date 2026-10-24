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
