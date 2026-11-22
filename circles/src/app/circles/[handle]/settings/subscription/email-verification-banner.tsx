"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { AlertCircle, Loader2, MailCheck } from "lucide-react";
import type { AccountSettingsClientUser } from "@/lib/data/client-user-dto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { shouldShowEmailVerificationBanner } from "@/lib/auth/email-verification-recovery";
import { resendEmailVerificationAction } from "./actions";

export function EmailVerificationBanner({ user }: { user: AccountSettingsClientUser }) {
    const router = useRouter();
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const email = user.email?.trim();
    const needsVerification = !email || shouldShowEmailVerificationBanner(user);

    const handleResend = () => {
        startTransition(async () => {
            const result = await resendEmailVerificationAction();

            toast({
                title: result.message,
                variant: result.success ? "default" : "destructive",
            });

            if (result.success) {
                router.refresh();
            }
        });
    };

    return (
        <Card
            id="email-verification"
            className={needsVerification ? "border-amber-200 bg-amber-50 text-amber-950" : undefined}
        >
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        {needsVerification && <AlertCircle aria-hidden="true" className="h-5 w-5 shrink-0" />}
                        <h2 className="text-lg font-semibold tracking-tight">Primary email</h2>
                        <Badge variant="secondary">{needsVerification ? "Unverified" : "Verified"}</Badge>
                    </div>
                    <p className="break-words text-sm font-medium">{email || "No email address on file"}</p>
                    {email && needsVerification && (
                        <p className="text-sm">
                            Verify your email address to post, comment, react, and use other participation features.
                        </p>
                    )}
                    <a
                        href="mailto:hello@socialsystems.io?subject=Kamooni%20account%20email%20help"
                        className="text-sm underline underline-offset-4"
                    >
                        Contact support for help with your email address
                    </a>
                </div>
                {email && needsVerification && (
                    <Button type="button" onClick={handleResend} disabled={isPending} className="shrink-0">
                        {isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <MailCheck className="mr-2 h-4 w-4" />
                        )}
                        Resend verification email
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}
