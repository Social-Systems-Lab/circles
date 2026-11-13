import { isPendingRegistrationEnabled } from "@/lib/auth/pending-registration";
import {
    getRegistrationRouting,
    isRegistrationRoutingAllowed,
    type RegistrationRoutingRecord,
} from "@/lib/auth/registration-routing";

export type PublicRegistrationEntryState = "legacy" | "pending" | "paused" | "unavailable";

export type PublicRegistrationEntryView =
    | { kind: "form"; form: "legacy" | "pending" }
    | { kind: "redirect"; destination: "/signup" }
    | { kind: "unavailable"; reason: "paused" | "unavailable" };

type PublicRegistrationEntryOptions = {
    pendingJourneyEnabled: boolean;
    currentDeploymentId?: string;
};

export function resolvePublicRegistrationEntryState(
    routing: Pick<RegistrationRoutingRecord, "mode" | "deploymentId">,
    options: PublicRegistrationEntryOptions,
): PublicRegistrationEntryState {
    if (routing.mode === "paused") return "paused";
    if (routing.mode === "legacy") {
        return isRegistrationRoutingAllowed(routing, "legacy", options.currentDeploymentId) ? "legacy" : "unavailable";
    }
    if (!options.pendingJourneyEnabled) return "unavailable";
    return isRegistrationRoutingAllowed(routing, "pending", options.currentDeploymentId) ? "pending" : "unavailable";
}

export function resolvePublicRegistrationEntryView(
    state: PublicRegistrationEntryState,
    path: "/signup" | "/signup/pilot",
): PublicRegistrationEntryView {
    if (state === "pending") {
        return path === "/signup/pilot"
            ? { kind: "redirect", destination: "/signup" }
            : { kind: "form", form: "pending" };
    }
    if (state === "legacy") return { kind: "form", form: "legacy" };
    return { kind: "unavailable", reason: state };
}

export async function getPublicRegistrationEntryState(): Promise<PublicRegistrationEntryState> {
    try {
        const routing = await getRegistrationRouting();
        return resolvePublicRegistrationEntryState(routing, {
            pendingJourneyEnabled: isPendingRegistrationEnabled(),
        });
    } catch {
        console.error("Unable to resolve public registration routing");
        return "unavailable";
    }
}
