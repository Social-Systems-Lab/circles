"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Send, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { isIosOrIpadOs, isStandaloneDisplayMode } from "@/lib/pwa/install-state";
import {
    detectClientPushCapability,
    fetchMyPushSubscriptions,
    fetchPushConfig,
    getExistingPushSubscription,
    reconcilePushSubscriptionForAuthenticatedUser,
    subscribeCurrentBrowserToPush,
    unsubscribeCurrentBrowserFromPush,
    type ClientPushCapability,
} from "@/lib/push/client-push";
import type { PublicPushConfig } from "@/lib/push/config";
import {
    DEFAULT_PUSH_NOTIFICATION_PREFERENCES,
    type PushNotificationCategoryKey,
    type PushNotificationPreferences,
} from "@/lib/push/types";

const PUSH_CATEGORY_OPTIONS: Array<{
    key: PushNotificationCategoryKey;
    label: string;
    description: string;
}> = [
    {
        key: "messages",
        label: "Messages & mentions",
        description: "Direct messages and chat mentions.",
    },
    {
        key: "events",
        label: "Events & invitations",
        description: "Event invitations, updates, and cancellations.",
    },
    {
        key: "tasks",
        label: "Tasks & shifts",
        description: "Task assignments, verification updates, and shift confirmations.",
    },
    {
        key: "community",
        label: "Circles & discussions",
        description: "Circle invites, comments, replies, proposals, issues, and goals.",
    },
    {
        key: "account",
        label: "Account & verification",
        description: "Account verification status and admin updates.",
    },
];

export function PushNotificationsCard() {
    const [config, setConfig] = useState<PublicPushConfig | null>(null);
    const [capability, setCapability] = useState<ClientPushCapability>("unsupported");
    const [isSubscribedThisDevice, setIsSubscribedThisDevice] = useState(false);
    const [activeDeviceCount, setActiveDeviceCount] = useState(0);
    const [preferences, setPreferences] = useState<PushNotificationPreferences>(
        DEFAULT_PUSH_NOTIFICATION_PREFERENCES,
    );
    const [isLoaded, setIsLoaded] = useState(false);
    const [isDeviceBusy, setIsDeviceBusy] = useState(false);
    const [isSendingTest, setIsSendingTest] = useState(false);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const refreshState = useCallback(async () => {
        if (typeof window === "undefined") {
            return;
        }

        const nextCapability = detectClientPushCapability({
            isSecureContext: window.isSecureContext,
            hasServiceWorker: "serviceWorker" in window.navigator,
            hasPushManager: "PushManager" in window,
            hasNotification: "Notification" in window,
            isIos: isIosOrIpadOs(window.navigator),
            isStandalone: isStandaloneDisplayMode(window),
            notificationPermission: "Notification" in window ? window.Notification.permission : "unsupported",
        });
        setCapability(nextCapability);

        const pushConfig = await fetchPushConfig();
        setConfig(pushConfig);
        if (!pushConfig.enabled) {
            setIsLoaded(true);
            return;
        }

        const [existingSub, subListResult, prefsResult] = await Promise.all([
            getExistingPushSubscription(),
            fetchMyPushSubscriptions().catch(() => ({ enabled: true, subscriptions: [] })),
            fetch("/api/notification-preferences", { cache: "no-store", credentials: "same-origin" })
                .then((res) => (res.ok ? res.json() : null))
                .catch(() => null),
        ]);

        setIsSubscribedThisDevice(Boolean(existingSub));
        setActiveDeviceCount(subListResult.subscriptions.length);

        if (prefsResult?.push) {
            setPreferences(prefsResult.push as PushNotificationPreferences);
        }

        if (existingSub && "Notification" in window && window.Notification.permission === "granted") {
            const reconciled = await reconcilePushSubscriptionForAuthenticatedUser();
            if (reconciled.reconciled) {
                const updatedList = await fetchMyPushSubscriptions().catch(() => null);
                if (updatedList) {
                    setActiveDeviceCount(updatedList.subscriptions.length);
                }
            }
        }

        setIsLoaded(true);
    }, []);

    useEffect(() => {
        void refreshState();
    }, [refreshState]);

    if (!isLoaded || !config?.enabled) {
        return null;
    }

    const handleEnableDevice = async () => {
        if (!config.vapidPublicKey) {
            toast({ title: "Push notifications are not configured.", variant: "destructive" });
            return;
        }

        setIsDeviceBusy(true);
        try {
            const result = await subscribeCurrentBrowserToPush(config.vapidPublicKey);
            if (!result.ok) {
                if (result.reason === "denied") {
                    setCapability("denied");
                }
                toast({
                    title: result.message,
                    variant: result.reason === "dismissed" ? "default" : "destructive",
                });
                return;
            }

            setIsSubscribedThisDevice(true);
            const list = await fetchMyPushSubscriptions().catch(() => null);
            if (list) {
                setActiveDeviceCount(list.subscriptions.length);
            } else {
                setActiveDeviceCount((count) => Math.max(1, count));
            }
            toast({ title: "Push notifications enabled on this device." });
        } finally {
            setIsDeviceBusy(false);
        }
    };

    const handleDisableDevice = async () => {
        setIsDeviceBusy(true);
        try {
            await unsubscribeCurrentBrowserFromPush();
            setIsSubscribedThisDevice(false);
            const list = await fetchMyPushSubscriptions().catch(() => null);
            if (list) {
                setActiveDeviceCount(list.subscriptions.length);
            } else {
                setActiveDeviceCount((count) => Math.max(0, count - 1));
            }
            toast({ title: "Push notifications disabled on this device." });
        } catch (error) {
            toast({
                title: error instanceof Error ? error.message : "Could not disable push notifications.",
                variant: "destructive",
            });
        } finally {
            setIsDeviceBusy(false);
        }
    };

    const handleSendTest = async () => {
        setIsSendingTest(true);
        try {
            const response = await fetch("/api/push/test", {
                method: "POST",
                credentials: "same-origin",
            });
            const data = (await response.json().catch(() => null)) as {
                accepted?: number;
                attempted?: number;
                error?: string;
            } | null;

            if (!response.ok) {
                toast({
                    title: data?.error || "Could not send test notification.",
                    variant: "destructive",
                });
                return;
            }

            if ((data?.accepted ?? 0) > 0) {
                toast({ title: "Test push notification sent." });
            } else {
                toast({
                    title: "No active push device accepted the test notification.",
                    variant: "destructive",
                });
            }
        } finally {
            setIsSendingTest(false);
        }
    };

    const patchPushPreferences = (patch: {
        enabled?: boolean;
        categories?: Partial<Record<PushNotificationCategoryKey, boolean>>;
    }) => {
        const previous = preferences;
        const optimistic: PushNotificationPreferences = {
            enabled: patch.enabled ?? previous.enabled,
            categories: {
                ...previous.categories,
                ...(patch.categories ?? {}),
            },
        };
        setPreferences(optimistic);

        startTransition(async () => {
            try {
                const response = await fetch("/api/notification-preferences", {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ push: patch }),
                });

                if (!response.ok) {
                    const body = (await response.json().catch(() => null)) as { error?: string } | null;
                    throw new Error(body?.error || "Failed to update push preferences.");
                }

                const updated = (await response.json()) as { push?: PushNotificationPreferences };
                if (updated.push) {
                    setPreferences(updated.push);
                }
                toast({ title: "Push preferences updated." });
            } catch (error) {
                setPreferences(previous);
                toast({
                    title: error instanceof Error ? error.message : "Failed to update push preferences.",
                    variant: "destructive",
                });
            }
        });
    };

    return (
        <Card>
            <CardHeader className="space-y-2 pb-5">
                <CardTitle className="text-2xl font-semibold tracking-tight">Push Notifications</CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-6">
                    Receive alerts for invitations, tasks, and direct messages on this browser or device. Lock-screen
                    alerts use generic text without private message contents or private Circle names.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {capability === "ios_requires_install" ? (
                    <div className="flex items-start gap-3 rounded-lg border p-4">
                        <Share className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="space-y-1">
                            <p className="text-sm font-medium">Add Kamooni to your Home Screen first</p>
                            <p className="text-sm text-muted-foreground">
                                On iPhone and iPad, tap Safari&apos;s Share button, select{" "}
                                <strong>Add to Home Screen</strong>, and open Kamooni from the Home Screen icon to
                                enable push notifications.
                            </p>
                        </div>
                    </div>
                ) : capability === "unsupported" ? (
                    <div className="flex items-start gap-3 rounded-lg border p-4">
                        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="space-y-1">
                            <p className="text-sm font-medium">Push notifications are unavailable on this browser</p>
                            <p className="text-sm text-muted-foreground">
                                Your Kamooni account, in-app notifications, and email digests continue to work normally.
                            </p>
                        </div>
                    </div>
                ) : capability === "denied" ? (
                    <div className="flex items-start gap-3 rounded-lg border p-4">
                        <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="space-y-1">
                            <p className="text-sm font-medium">Notifications are blocked for Kamooni</p>
                            <p className="text-sm text-muted-foreground">
                                To enable push alerts on this device, allow Notifications for this site in your
                                browser settings and reload the page.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <Bell className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                            <div className="space-y-1">
                                <Label>This device</Label>
                                <p className="text-sm text-muted-foreground">
                                    {isSubscribedThisDevice
                                        ? `Push notifications are enabled on this browser (${activeDeviceCount} active ${
                                              activeDeviceCount === 1 ? "device" : "devices"
                                          } on your account).`
                                        : "Opt in separately on each browser or device where you want alerts."}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {isSubscribedThisDevice ? (
                                <>
                                    {config.dispatchEnabled ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={handleSendTest}
                                            disabled={isDeviceBusy || isSendingTest}
                                        >
                                            <Send className="mr-1.5 h-4 w-4" />
                                            Send test
                                        </Button>
                                    ) : null}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleDisableDevice}
                                        disabled={isDeviceBusy || isSendingTest}
                                    >
                                        Disable on this device
                                    </Button>
                                </>
                            ) : (
                                <Button type="button" onClick={handleEnableDevice} disabled={isDeviceBusy}>
                                    Enable push notifications
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                <div className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                            <Label htmlFor="push-master-enabled">Enable push alerts across my devices</Label>
                            <p className="text-sm text-muted-foreground">
                                Turn off to pause push deliveries without removing your registered devices.
                            </p>
                        </div>
                        <Switch
                            id="push-master-enabled"
                            checked={preferences.enabled}
                            onCheckedChange={(checked) => patchPushPreferences({ enabled: checked })}
                            disabled={isPending}
                            aria-label="Enable push alerts across my devices"
                        />
                    </div>

                    <div className="space-y-2 border-t pt-3">
                        {PUSH_CATEGORY_OPTIONS.map((option) => {
                            const switchId = `push-category-${option.key}`;
                            return (
                                <div key={option.key} className="flex items-center justify-between gap-4 py-1.5">
                                    <div className="space-y-0.5">
                                        <Label htmlFor={switchId}>{option.label}</Label>
                                        <p className="text-sm text-muted-foreground">{option.description}</p>
                                    </div>
                                    <Switch
                                        id={switchId}
                                        checked={preferences.categories[option.key]}
                                        onCheckedChange={(checked) =>
                                            patchPushPreferences({ categories: { [option.key]: checked } })
                                        }
                                        disabled={isPending || !preferences.enabled}
                                        aria-label={option.label}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
