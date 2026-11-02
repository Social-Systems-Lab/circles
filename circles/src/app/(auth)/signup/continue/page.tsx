import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PasswordCreationCard } from "@/components/forms/signup/password-creation-card";
import { createPendingRegistrationRuntimeDependencies } from "@/lib/auth/pending-registration-runtime";
import { getVerifiedPendingRegistration, isPendingRegistrationEnabled } from "@/lib/auth/pending-registration";
import { isRegistrationModeAllowed } from "@/lib/auth/registration-routing";

export const dynamic = "force-dynamic";

export default async function PendingRegistrationContinuePage() {
    if (!isPendingRegistrationEnabled() || !(await isRegistrationModeAllowed("pending"))) redirect("/signup");

    const value = (await cookies()).get("__Host-kamooni-verified-registration")?.value;
    const [id, secret, extra] = value?.split(".") ?? [];
    let authorizationAvailable = false;
    if (id && secret && !extra) {
        try {
            const deps = await createPendingRegistrationRuntimeDependencies();
            authorizationAvailable = (await getVerifiedPendingRegistration(id, secret, deps)).success;
        } catch {
            authorizationAvailable = false;
        }
    }

    return <PasswordCreationCard authorizationAvailable={authorizationAvailable} />;
}
