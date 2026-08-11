import { ensureRequiredChatIndexes } from "@/lib/data/db";

export async function registerNodeInstrumentation(): Promise<void> {
    try {
        await ensureRequiredChatIndexes();
    } catch (error) {
        console.error("Required chat index initialization failed; refusing to start the Node server.", error);
        process.exit(1);
    }
}
