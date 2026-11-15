import {
    getRegistrationRouting,
    setRegistrationMode,
    type RegistrationRoutingCollection,
} from "@/lib/auth/registration-routing";
import type { WatchdogPauseResult } from "@/lib/auth/pending-registration-watchdog";

export async function pausePendingRegistrationForWatchdog(
    collection: RegistrationRoutingCollection,
    expectedDeploymentId: string,
): Promise<Exclude<WatchdogPauseResult, "not_requested">> {
    const initial = await getRegistrationRouting(collection);
    if (initial.mode !== "pending" || initial.deploymentId !== expectedDeploymentId) {
        return initial.mode === "paused" ? "already_paused" : "not_pending";
    }
    const changed = await setRegistrationMode(
        {
            expectedMode: "pending",
            mode: "paused",
            deploymentId: null,
            expectedDeploymentId,
            updatedBy: "onboarding-watchdog",
        },
        collection,
    );
    if (changed) return "paused";
    const current = await getRegistrationRouting(collection);
    return current.mode === "paused" ? "already_paused" : "not_pending";
}
