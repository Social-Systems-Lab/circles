import { PilotSignupForm } from "@/components/forms/signup/pilot-signup-form";
import { SignupUnavailable } from "@/components/forms/signup/signup-unavailable";
import {
    getPublicRegistrationEntryState,
    resolvePublicRegistrationEntryView,
} from "@/lib/auth/public-registration-entry";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PilotSignupPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const view = resolvePublicRegistrationEntryView(await getPublicRegistrationEntryState(), "/signup/pilot");
    if (view.kind === "redirect") {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(await searchParams)) {
            for (const item of Array.isArray(value) ? value : value ? [value] : []) params.append(key, item);
        }
        const query = params.toString();
        redirect(query ? `${view.destination}?${query}` : view.destination);
    }
    if (view.kind === "unavailable") return <SignupUnavailable reason={view.reason} />;
    return <PilotSignupForm />;
}
