"use client";

import { useState, useTransition } from "react";
import type { TelegramChannelView } from "@/lib/data/external-notification-channels";
import {
    createTelegramConnectLink,
    disconnectTelegramNotifications,
    updateTelegramPrivacyMode,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

const privacyModeLabels = {
    notify_only: "Notify only",
    snippet: "Snippet",
    full: "Full message",
} as const;

type PrivacyMode = keyof typeof privacyModeLabels;

export function TelegramNotificationsSettingsCard({
    initialChannel,
}: {
    initialChannel?: TelegramChannelView | null;
}) {
    const [channel, setChannel] = useState<TelegramChannelView>(
        initialChannel || {
            enabled: false,
            privacyMode: "notify_only",
            connected: false,
        },
    );
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const handleConnect = () => {
        startTransition(async () => {
            const result = await createTelegramConnectLink();
            if (!result.success || !result.url) {
                toast({ title: result.message || "Could not create Telegram connection link.", variant: "destructive" });
                return;
            }
            window.open(result.url, "_blank", "noopener,noreferrer");
            toast({ title: "Telegram connection link opened." });
        });
    };

    const handleDisconnect = () => {
        startTransition(async () => {
            const result = await disconnectTelegramNotifications();
            if (!result.success) {
                toast({ title: result.message, variant: "destructive" });
                return;
            }
            setChannel((current) => ({
                ...current,
                enabled: false,
                connected: false,
                telegramUsername: undefined,
            }));
            toast({ title: result.message });
        });
    };

    const handlePrivacyChange = (mode: PrivacyMode) => {
        setChannel((current) => ({ ...current, privacyMode: mode }));
        startTransition(async () => {
            const result = await updateTelegramPrivacyMode(mode);
            if (!result.success) {
                toast({ title: result.message, variant: "destructive" });
                return;
            }
            toast({ title: result.message });
        });
    };

    return (
        <Card>
            <CardHeader className="space-y-2 pb-5">
                <CardTitle className="text-2xl font-semibold tracking-tight">Telegram Notifications</CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-6">
                    Forward direct message notifications to Telegram without changing your Kamooni inbox.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <Label>Connection</Label>
                        <p className="text-sm text-muted-foreground">
                            {channel.connected
                                ? `Connected${channel.telegramUsername ? ` as @${channel.telegramUsername}` : ""}.`
                                : "Not connected."}
                        </p>
                        {!channel.connected && (
                            <p className="text-sm text-muted-foreground">
                                Click Connect Telegram, then press Start in Telegram to finish linking your account.
                            </p>
                        )}
                    </div>
                    {channel.connected ? (
                        <Button type="button" variant="outline" onClick={handleDisconnect} disabled={isPending}>
                            Disconnect
                        </Button>
                    ) : (
                        <Button type="button" onClick={handleConnect} disabled={isPending}>
                            Connect Telegram
                        </Button>
                    )}
                </div>

                <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <Label htmlFor="telegram-privacy-mode">Message privacy</Label>
                        <p className="text-sm text-muted-foreground">
                            Choose how much direct message content Telegram receives.
                        </p>
                    </div>
                    <Select
                        value={channel.privacyMode}
                        onValueChange={(value) => handlePrivacyChange(value as PrivacyMode)}
                        disabled={isPending}
                    >
                        <SelectTrigger id="telegram-privacy-mode" className="w-full sm:w-48">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {Object.entries(privacyModeLabels).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardContent>
        </Card>
    );
}
