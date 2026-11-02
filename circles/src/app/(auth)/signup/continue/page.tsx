import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isPendingRegistrationEnabled } from "@/lib/auth/pending-registration";
import { isRegistrationModeAllowed } from "@/lib/auth/registration-routing";
import { createPendingRegistrationRuntimeDependencies } from "@/lib/auth/pending-registration-runtime";
import { resumePendingRegistration } from "@/lib/auth/pending-registration";

export const dynamic = "force-dynamic";

export default async function PendingRegistrationContinuePage() {
    if (!isPendingRegistrationEnabled() || !(await isRegistrationModeAllowed("pending"))) redirect("/signup");
    const value = (await cookies()).get("__Host-kamooni-verified-registration")?.value;
    const [id, secret, extra] = value?.split(".") ?? [];
    if (!id || !secret || extra) redirect("/signup?verification=invalid");
    try {
        const deps = await createPendingRegistrationRuntimeDependencies();
        const state = await resumePendingRegistration(id, secret, deps);
        if (!state.success || state.status !== "email_verified") redirect("/signup?verification=invalid");
        return (
            <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center p-4">
                <section
                    className="w-full rounded-xl border bg-background p-6 shadow-sm"
                    aria-labelledby="continue-title"
                >
                    <h1 id="continue-title" className="text-xl font-semibold">
                        Email verified
                    </h1>
                    <p className="mt-3 text-sm text-muted-foreground">
                        Your email address is verified. Registration is not complete yet. Please return to signup when
                        the password setup step is available.
                    </p>
                    <p className="mt-2 break-all text-sm">{state.email}</p>
                </section>
            </main>
        );
    } catch {
        redirect("/signup?verification=invalid");
    }
}
