import { PilotSignupForm } from "@/components/forms/signup/pilot-signup-form";
import { PendingSignupForm } from "@/components/forms/signup/pending-signup-form";
import { SignupUnavailable } from "@/components/forms/signup/signup-unavailable";
import {
    getPublicRegistrationEntryState,
    resolvePublicRegistrationEntryView,
} from "@/lib/auth/public-registration-entry";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function Signup() {
    const view = resolvePublicRegistrationEntryView(await getPublicRegistrationEntryState(), "/signup");
    if (view.kind === "unavailable") return <SignupUnavailable reason={view.reason} />;
    if (view.kind === "redirect") redirect(view.destination);
    return view.form === "pending" ? (
        <Suspense fallback={<div className="p-6 text-center">Loading signup…</div>}>
            <PendingSignupForm />
        </Suspense>
    ) : (
        <PilotSignupForm />
    );
}
