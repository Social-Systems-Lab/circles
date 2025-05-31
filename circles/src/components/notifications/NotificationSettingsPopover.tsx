"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NotificationBellIcon } from "./NotificationBellIcon";
import {
    getGroupedUserNotificationSettings,
    updateUserNotificationSetting,
    GroupedNotificationSettings,
} from "@/lib/actions/notificationSettings";
import { EntityType, NotificationType, notificationTypeValues } from "@/models/models";
import { useToast } from "@/components/ui/use-toast"; // Assuming you have a toast hook

interface NotificationSettingsPopoverProps {
    entityType: EntityType;
    entityId: string;
    className?: string;
}

type EntitySpecificSettings = Record<NotificationType, { isEnabled: boolean; isConfigurable: boolean }>;

// Helper to get user-friendly labels for notification types
const getNotificationTypeLabel = (type: NotificationType): string => {
    return type
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
};

export const NotificationSettingsPopover: React.FC<NotificationSettingsPopoverProps> = ({
    entityType,
    entityId,
    className,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [settings, setSettings] = useState<EntitySpecificSettings | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    const fetchSettings = useCallback(async () => {
        if (!isOpen) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await getGroupedUserNotificationSettings();
            if ("error" in result) {
                setError(result.error);
                setSettings(null);
            } else {
                const entitySettings = result[entityType]?.[entityId];
                if (entitySettings) {
                    setSettings(entitySettings);
                } else {
                    // Initialize with defaults if no specific settings found for this entity
                    const defaultEntitySettings: EntitySpecificSettings = {} as EntitySpecificSettings;
                    // This part needs refinement: how to get *relevant* default settings for this specific entityType
                    // For now, we'll iterate all notification types and assume a default if not present.
                    // A proper solution would involve the backend providing applicable defaults for the entityType.
                    notificationTypeValues.forEach((nt) => {
                        // @ts-ignore - Placeholder for default logic
                        defaultEntitySettings[nt] = { isEnabled: true, isConfigurable: true };
                    });
                    setSettings(defaultEntitySettings);
                }
            }
        } catch (e) {
            setError("An unexpected error occurred while fetching settings.");
            setSettings(null);
        } finally {
            setIsLoading(false);
        }
    }, [entityType, entityId, isOpen]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const handleSettingChange = async (type: NotificationType, checked: boolean) => {
        if (!settings) return;

        const originalSetting = settings[type];
        // Optimistically update UI
        setSettings((prev) => ({
            ...prev!,
            [type]: { ...prev![type], isEnabled: checked },
        }));

        try {
            const result = await updateUserNotificationSetting({
                entityType,
                entityId,
                notificationType: type,
                isEnabled: checked,
            });

            if ("error" in result) {
                toast({
                    title: "Error",
                    description: `Failed to update setting: ${result.error}`,
                    variant: "destructive",
                });
                // Revert optimistic update
                setSettings((prev) => ({
                    ...prev!,
                    [type]: originalSetting,
                }));
            } else {
                toast({
                    title: "Success",
                    description: `${getNotificationTypeLabel(type)} setting updated.`,
                });
            }
        } catch (e) {
            toast({
                title: "Error",
                description: "An unexpected error occurred while updating the setting.",
                variant: "destructive",
            });
            // Revert optimistic update
            setSettings((prev) => ({
                ...prev!,
                [type]: originalSetting,
            }));
        }
    };

    const configurableSettings = settings ? Object.entries(settings).filter(([_, value]) => value.isConfigurable) : [];

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <NotificationBellIcon onClick={() => setIsOpen((v) => !v)} className={className} />
            </PopoverTrigger>
            <PopoverContent className="w-80">
                <div className="grid gap-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Notification Settings</h4>
                        <p className="text-sm text-muted-foreground">
                            Manage notifications for this {entityType.toLowerCase()}.
                        </p>
                    </div>
                    {isLoading && <p>Loading settings...</p>}
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    {!isLoading && !error && settings && (
                        <div className="grid gap-2">
                            {configurableSettings.length > 0 ? (
                                configurableSettings.map(([type, setting]) => (
                                    <div key={type} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`${entityId}-${type}`}
                                            checked={setting.isEnabled}
                                            onCheckedChange={(checked) =>
                                                handleSettingChange(type as NotificationType, !!checked)
                                            }
                                            disabled={!setting.isConfigurable}
                                        />
                                        <Label htmlFor={`${entityId}-${type}`} className="text-sm font-normal">
                                            {getNotificationTypeLabel(type as NotificationType)}
                                        </Label>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    No configurable notifications for this item.
                                </p>
                            )}
                        </div>
                    )}
                    {!isLoading && !error && !settings && !configurableSettings.length && (
                        <p className="text-sm text-muted-foreground">No notification settings available.</p>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
};
