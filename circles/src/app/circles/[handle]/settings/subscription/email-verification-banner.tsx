"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { AlertCircle, Loader2, MailCheck } from "lucide-react";
import type { Circle } from "@/models/models";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { shouldShowEmailVerificationBanner } from "@/lib/auth/email-verification-recovery";
import { resendEmailVerificationAction } from "./actions";

export function EmailVerificationBanner({ user }: { user: Circle }) {
    const router = useRouter();
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    if (!shouldShowEmailVerificationBanner(user)) {
        return null;
    }

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
        <Card id="email-verification" className="border-amber-200 bg-amber-50 text-amber-950">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div className="space-y-1">
                        <h2 className="text-lg font-semibold tracking-tight">Verify your email</h2>
                        <p className="max-w-2xl text-sm leading-6">
                            Verify your email address to post, comment, react, and use other participation features.
                        </p>
                        {user.email ? <p className="text-sm font-medium">{user.email}</p> : null}
                    </div>
                </div>
                <Button type="button" onClick={handleResend} disabled={isPending} className="shrink-0">
                    {isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <MailCheck className="mr-2 h-4 w-4" />
                    )}
                    Resend verification email
                </Button>
            </CardContent>
        </Card>
    );
}
