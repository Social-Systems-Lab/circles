import { ensureRequiredChatIndexes } from "@/lib/data/db";
import { enforceEmailCaptureModeAtBoot } from "@/lib/email/capture-mode";

export async function registerNodeInstrumentation(): Promise<void> {
    enforceEmailCaptureModeAtBoot();
    try {
        await ensureRequiredChatIndexes();
    } catch (error) {
        console.error("Required chat index initialization failed; refusing to start the Node server.", error);
        process.exit(1);
    }
}
