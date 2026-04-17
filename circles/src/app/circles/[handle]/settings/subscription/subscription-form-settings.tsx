"use client";

import { useState, useTransition } from "react";
import { Circle } from "@/models/models";
import SubscriptionForm from "./subscription-form";
import { VerificationSettingsCard } from "./verification-settings-card";
import { updateEmailPreferenceSetting } from "./actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

type EmailPreferenceKey = "emailMissedMessages" | "emailTaskAssigned" | "emailTaskUpdates" | "emailVerificationUpdates";

const emailPreferenceOptions: { key: EmailPreferenceKey; label: string; description: string }[] = [
    {
        key: "emailMissedMessages",
        label: "Email me if I miss a message",
        description: "Sends a delayed reminder email if you have not read a direct message yet.",
    },
    {
        key: "emailTaskAssigned",
        label: "Email me when I am assigned a task",
        description: "Sends an email when someone assigns you a task.",
    },
    {
        key: "emailTaskUpdates",
        label: "Email me about updates to tasks assigned to me",
        description: "Sends an email when assigned work changes, needs revision, or is verified.",
    },
    {
        key: "emailVerificationUpdates",
        label: "Email me about verification or admin thread updates that need my response",
        description: "Sends an email when your verification thread needs attention.",
    },
];

const getInitialEmailPreferences = (user: Circle): Record<EmailPreferenceKey, boolean> => ({
    emailMissedMessages: user.emailMissedMessages !== false,
    emailTaskAssigned: user.emailTaskAssigned === true,
    emailTaskUpdates: user.emailTaskUpdates === true,
    emailVerificationUpdates: user.emailVerificationUpdates === true,
});

export default function SubscriptionFormSettings({ user }: { user: Circle }) {
    const [subscriptionAttempted, setSubscriptionAttempted] = useState(false);
    const initialEmailPreferences = getInitialEmailPreferences(user);

    const handleDialogClose = () => {
        setSubscriptionAttempted(true);
    };

    if (subscriptionAttempted) {
        return (
            <div className="space-y-8">
                <VerificationSettingsCard />
                <EmailPreferencesSettingsCard initialValues={initialEmailPreferences} />
                <section className="space-y-4">
                    <div className="space-y-1 px-1">
                        <h2 className="text-lg font-semibold tracking-tight">Membership</h2>
                        <p className="text-sm text-muted-foreground">
                            Founding membership supports Kamooni and unlocks member benefits.
                        </p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 px-6 py-8 text-center">
                        <h3 className="text-2xl font-bold tracking-tight">Thank You!</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Your subscription is being processed. Your membership status will be updated shortly.
                        </p>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <VerificationSettingsCard />
            <EmailPreferencesSettingsCard initialValues={initialEmailPreferences} />
            <section className="space-y-4">
                <div className="space-y-1 px-1">
                    <h2 className="text-lg font-semibold tracking-tight">Membership</h2>
                    <p className="text-sm text-muted-foreground">
                        Founding membership supports Kamooni and unlocks member benefits.
                    </p>
                </div>
                <SubscriptionForm circle={user} onDialogClose={handleDialogClose} />
            </section>
        </div>
    );
}

function EmailPreferencesSettingsCard({ initialValues }: { initialValues: Record<EmailPreferenceKey, boolean> }) {
    const [emailPreferences, setEmailPreferences] = useState(initialValues);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const handleCheckedChange = (preference: EmailPreferenceKey, checked: boolean) => {
        startTransition(async () => {
            const result = await updateEmailPreferenceSetting(preference, checked);

            if (!result.success) {
                toast({
                    title: result.message,
                    variant: "destructive",
                });
                return;
            }

            setEmailPreferences((current) => ({
                ...current,
                [preference]: checked,
            }));
            toast({
                title: result.message,
            });
        });
    };

    return (
        <Card>
            <CardHeader className="space-y-2 pb-5">
                <CardTitle className="text-2xl font-semibold tracking-tight">Email Preferences</CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-6">
                    Actionable email notifications are on by default. Turn off anything you do not want to receive.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {emailPreferenceOptions.map((option) => {
                    const switchId = option.key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

                    return (
                        <div key={option.key} className="flex items-center justify-between gap-4 rounded-lg border p-4">
                            <div className="space-y-1">
                                <Label htmlFor={switchId}>{option.label}</Label>
                                <p className="text-sm text-muted-foreground">{option.description}</p>
                            </div>
                            <Switch
                                id={switchId}
                                checked={emailPreferences[option.key]}
                                onCheckedChange={(checked) => handleCheckedChange(option.key, checked)}
                                disabled={isPending}
                                aria-label={option.label}
                            />
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
