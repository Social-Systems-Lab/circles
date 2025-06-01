"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
// import { Button } from "@/components/ui/button"; // Not directly used, but PopoverTrigger might use it via asChild
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NotificationBellIcon } from "./NotificationBellIcon";
import { getGroupedUserNotificationSettings, updateUserNotificationSetting } from "@/lib/actions/notificationSettings";
import {
    EntityType,
    NotificationType,
    notificationTypeValues,
    GroupedNotificationSettings,
    UserPrivate,
} from "@/models/models";
import { useToast } from "@/components/ui/use-toast"; // Assuming you have a toast hook
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { getDefaultSettingsForEntityType } from "@/lib/actions/notificationSettings";
// Note: checkUserPermissionForNotification is a server-side function.
// `isConfigurable` flags are now expected to be correctly set by `getGroupedUserNotificationSettings`
// and included in the `UserPrivate` object's `notificationSettings`.

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
    const [userPrivateData, setUserPrivateData] = useAtom(userAtom);

    // Derive settings directly from the Jotai atom
    const entitySettingsFromAtom = userPrivateData?.notificationSettings?.[entityType]?.[entityId];

    // Local state to manage optimistic updates if needed, or to hold a working copy.
    // For simplicity, we can try to directly use entitySettingsFromAtom if updates are reflected quickly.
    // However, for optimistic UI, a local copy that syncs with atom is better.
    const [localSettings, setLocalSettings] = useState<EntitySpecificSettings | null>(null);

    const [isLoading, setIsLoading] = useState(false); // Kept for the update operation
    const [error, setError] = useState<string | null>(null); // Kept for update operation errors
    const { toast } = useToast();

    useEffect(() => {
        if (isOpen) {
            if (entitySettingsFromAtom) {
                setLocalSettings(entitySettingsFromAtom);
                setError(null);
            } else if (userPrivateData) {
                // User data loaded, but no specific settings for this entity
                // Initialize with defaults if no specific settings found for this entity
                // This assumes getGroupedUserNotificationSettings on the backend has already determined configurability
                // and provided a full structure for known entity types.
                // If userPrivateData.notificationSettings doesn't even have the entityType, it's an issue.
                const initialSettings: EntitySpecificSettings = {} as EntitySpecificSettings;
                notificationTypeValues.forEach((nt) => {
                    // Fallback if `getGroupedUserNotificationSettings` didn't provide a full structure
                    // (which it should, including defaults and configurability)
                    initialSettings[nt] = { isEnabled: true, isConfigurable: true };
                });
                setLocalSettings(initialSettings);
                console.warn(
                    `NotificationSettingsPopover: No settings found in userAtom for ${entityType}:${entityId}. Initializing with defaults. This might indicate an issue with getPrivateUser's data population.`,
                );
                setError(null);
            } else {
                // User data itself is not loaded yet, show loading or error.
                // This case should ideally be handled by a global loading state for userAtom.
                setError("User data not available. Cannot load notification settings.");
                setLocalSettings(null);
            }
        }
    }, [isOpen, userPrivateData, entityType, entityId]);

    const handleSettingChange = async (type: NotificationType, checked: boolean) => {
        if (!localSettings) return;

        const originalSettingState = localSettings[type];

        // Optimistically update local UI state
        setLocalSettings((prev) => ({
            ...prev!,
            [type]: { ...prev![type], isEnabled: checked },
        }));

        setIsLoading(true);
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
                setLocalSettings((prev) => ({
                    // Corrected: use setLocalSettings
                    ...prev!,
                    [type]: originalSettingState,
                }));
            } else {
                toast({
                    title: "Success",
                    description: `${getNotificationTypeLabel(type)} setting updated.`,
                });
                // JOTAI: Trigger a refresh of userPrivateData in the Jotai atom.
                // This typically involves calling the server action that populates userAtom.
                // For example, if there's a `refreshUserSession` function:
                // await refreshUserSession();
                // Or, if `updateUserNotificationSetting` returned the updated `UserPrivate` object,
                // you could update the atom directly:
                // setUserPrivateData(updatedUserPrivateData);
                console.log("TODO: Implement userAtom refresh after notification setting update.");
            }
        } catch (e) {
            toast({
                title: "Error",
                description: "An unexpected error occurred while updating the setting.",
                variant: "destructive",
            });
            // Revert optimistic update
            setLocalSettings((prev) => ({
                // Revert localSettings
                ...prev!,
                [type]: originalSettingState,
            }));
        } finally {
            setIsLoading(false);
        }
    };

    const configurableSettings = localSettings
        ? Object.entries(localSettings).filter(([_, value]) => value.isConfigurable)
        : [];

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                {/* onClick is removed here; PopoverTrigger with asChild handles it */}
                <NotificationBellIcon className={className} />
            </PopoverTrigger>
            <PopoverContent className="w-80">
                <div className="formatted grid gap-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Notification Settings</h4>
                        <p className="text-sm text-muted-foreground">
                            Manage notifications for this {entityType.toLowerCase()}.
                        </p>
                    </div>
                    {isLoading && <p>Updating...</p>}
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    {!isLoading &&
                        !error &&
                        localSettings && ( // Use localSettings for rendering
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
                    {!isLoading && !error && !localSettings && !configurableSettings.length && (
                        <p className="text-sm text-muted-foreground">
                            No notification settings available or user data not loaded.
                        </p>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
};
