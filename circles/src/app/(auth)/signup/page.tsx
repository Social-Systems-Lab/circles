import { PilotSignupForm } from "@/components/forms/signup/pilot-signup-form";
import { PendingSignupForm } from "@/components/forms/signup/pending-signup-form";
import { isPendingRegistrationEnabled } from "@/lib/auth/pending-registration";
import { isRegistrationModeAllowed } from "@/lib/auth/registration-routing";
import { Suspense } from "react";

export default async function Signup() {
    const pendingJourney = isPendingRegistrationEnabled() && (await isRegistrationModeAllowed("pending"));
    return pendingJourney ? (
        <Suspense fallback={<div className="p-6 text-center">Loading signup…</div>}>
            <PendingSignupForm />
        </Suspense>
    ) : (
        <PilotSignupForm />
    );
}
