import { redirect } from "next/navigation";
import { PendingRecoveryForm } from "@/components/forms/signup/pending-recovery-form";
import { isPendingRegistrationEnabled } from "@/lib/auth/pending-registration";
import { isRegistrationModeAllowed } from "@/lib/auth/registration-routing";

export const dynamic = "force-dynamic";

export default async function PendingRegistrationRecoveryPage() {
    if (!isPendingRegistrationEnabled() || !(await isRegistrationModeAllowed("pending"))) redirect("/signup");
    return <PendingRecoveryForm />;
}
