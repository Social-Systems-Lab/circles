"use client";

import { useState, useTransition } from "react";
import { Circle } from "@/models/models";
import SubscriptionForm from "./subscription-form";
import { VerificationSettingsCard } from "./verification-settings-card";
import { updateMissedMessageEmailSetting } from "./actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

export default function SubscriptionFormSettings({ user }: { user: Circle }) {
    const [subscriptionAttempted, setSubscriptionAttempted] = useState(false);

    const handleDialogClose = () => {
        setSubscriptionAttempted(true);
    };

    if (subscriptionAttempted) {
        return (
            <div className="space-y-10">
                <VerificationSettingsCard />
                <MissedMessageEmailSettingsCard initialValue={user.emailMissedMessages !== false} />
                <div className="flex flex-col items-center text-center">
                    <h1 className="text-2xl font-bold">Thank You!</h1>
                    <p className="mb-4">
                        Your subscription is being processed. Your membership status will be updated shortly.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-10">
            <VerificationSettingsCard />
            <MissedMessageEmailSettingsCard initialValue={user.emailMissedMessages !== false} />
            <SubscriptionForm circle={user} onDialogClose={handleDialogClose} />
        </div>
    );
}

function MissedMessageEmailSettingsCard({ initialValue }: { initialValue: boolean }) {
    const [emailMissedMessages, setEmailMissedMessages] = useState(initialValue);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const handleCheckedChange = (checked: boolean) => {
        startTransition(async () => {
            const result = await updateMissedMessageEmailSetting(checked);

            if (!result.success) {
                toast({
                    title: result.message,
                    variant: "destructive",
                });
                return;
            }

            setEmailMissedMessages(checked);
            toast({
                title: result.message,
            });
        });
    };

    return (
        <Card>
            <CardHeader className="space-y-2 pb-5">
                <CardTitle className="text-2xl font-semibold tracking-tight">Message reminders</CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-6">
                    Delayed email reminders for unread direct messages are on by default. Turn this off if you do not
                    want them.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-1">
                        <Label htmlFor="email-missed-messages">Email me if I miss a message</Label>
                        <p className="text-sm text-muted-foreground">
                            Sends a delayed reminder email if you have not read a direct message yet.
                        </p>
                    </div>
                    <Switch
                        id="email-missed-messages"
                        checked={emailMissedMessages}
                        onCheckedChange={handleCheckedChange}
                        disabled={isPending}
                        aria-label="Email me if I miss a message"
                    />
                </div>
            </CardContent>
        </Card>
    );
}
