import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CheckEmailCard } from "@/components/forms/signup/check-email-card";
import { isPendingRegistrationEnabled } from "@/lib/auth/pending-registration";
import { isRegistrationModeAllowed } from "@/lib/auth/registration-routing";

export const dynamic = "force-dynamic";

export default async function CheckEmailPage() {
    if (!isPendingRegistrationEnabled() || !(await isRegistrationModeAllowed("pending"))) redirect("/signup");

    return (
        <Suspense fallback={<div className="p-6 text-center">Loading signup…</div>}>
            <CheckEmailCard />
        </Suspense>
    );
}
