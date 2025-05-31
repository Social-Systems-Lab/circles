"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
// import { Button } from "@/components/ui/button"; // Not directly used, but PopoverTrigger might use it via asChild
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NotificationBellIcon } from "./NotificationBellIcon";
import { getGroupedUserNotificationSettings, updateUserNotificationSetting } from "@/lib/actions/notificationSettings";
import { EntityType, NotificationType, notificationTypeValues, GroupedNotificationSettings } from "@/models/models";
import { useToast } from "@/components/ui/use-toast"; // Assuming you have a toast hook
// import { useAtom } from "jotai"; // Placeholder for Jotai
// import { userPrivateAtom } from "@/lib/store/jotaiAtoms"; // Placeholder for your Jotai atom

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
    // const [userPrivateData, setUserPrivateData] = useAtom(userPrivateAtom); // JOTAI: Uncomment and use your atom

    // JOTAI: Derive settings from the Jotai atom
    // const allUserNotificationSettings = userPrivateData?.notificationSettings;
    // const currentEntitySettings = allUserNotificationSettings?.[entityType]?.[entityId];

    // Local state for settings, to be replaced or supplemented by Jotai
    const [settings, setSettings] = useState<EntitySpecificSettings | null>(null);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    const fetchAndSetSettings = useCallback(async () => {
        // JOTAI: This direct fetch might be replaced by relying on the atom,
        // or used as a refresh mechanism.
        if (!isOpen) return;
        setIsLoading(true);
        setError(null);
        try {
            // JOTAI: If atom is populated, use it. Otherwise, fetch.
            // For now, always fetching as placeholder.
            const result = await getGroupedUserNotificationSettings();
            if ("error" in result) {
                setError(result.error);
                setSettings(null);
            } else {
                const entitySettingsFromResult = result[entityType]?.[entityId];
                if (entitySettingsFromResult) {
                    setSettings(entitySettingsFromResult);
                } else {
                    // Initialize with defaults if no specific settings found for this entity
                    const defaultEntitySettings: EntitySpecificSettings = {} as EntitySpecificSettings;
                    notificationTypeValues.forEach((nt) => {
                        // @ts-ignore - Placeholder for default logic
                        defaultEntitySettings[nt] = { isEnabled: true, isConfigurable: true }; // Sensible default
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
        // JOTAI: If using Jotai, this effect might listen to changes in the atom for the specific entity,
        // or the initial settings could be directly derived from the atom when the component mounts/opens.
        if (isOpen) {
            // const jotaiEntitySettings = userPrivateData?.notificationSettings?.[entityType]?.[entityId];
            // if (jotaiEntitySettings) {
            //     setSettings(jotaiEntitySettings);
            // } else {
            //     fetchAndSetSettings(); // Fetch if not in Jotai or if refresh needed
            // }
            fetchAndSetSettings(); // Placeholder: always fetch when opened for now
        }
    }, [isOpen, fetchAndSetSettings /*, userPrivateData, entityType, entityId */]); // JOTAI: Add userPrivateData and dependencies

    const handleSettingChange = async (type: NotificationType, checked: boolean) => {
        if (!settings) return;

        const originalSettingState = settings[type];

        // Optimistically update local UI state
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
                    [type]: originalSettingState,
                }));
            } else {
                toast({
                    title: "Success",
                    description: `${getNotificationTypeLabel(type)} setting updated.`,
                });
                // JOTAI: Trigger a refresh of userPrivateData in the Jotai atom
                // e.g., by calling a function that re-fetches getPrivateUser
                // or by updating the atom directly if the server action returns enough info.
                // Example: refreshUserPrivateData();
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
                [type]: originalSettingState,
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
