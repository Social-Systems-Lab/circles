import { ensureRequiredChatIndexes } from "@/lib/data/db";
import { enforceEmailConfigurationAtBoot } from "@/lib/email/capture-config";

export async function registerNodeInstrumentation(): Promise<void> {
    try {
        enforceEmailConfigurationAtBoot();
    } catch (error) {
        console.error("Unsafe email transport configuration; refusing to start the Node server.", error);
        process.exit(1);
    }
    try {
        await ensureRequiredChatIndexes();
    } catch (error) {
        console.error("Required chat index initialization failed; refusing to start the Node server.", error);
        process.exit(1);
    }
}
