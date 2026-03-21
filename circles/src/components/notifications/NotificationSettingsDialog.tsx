"use client";

import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
// Accordion removed
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
// Select components removed as pause functionality is removed
import { NotificationBellIcon } from "./NotificationBellIcon";
import {
    // getGroupedUserNotificationSettings, // Not directly used for initialization in this version
    updateUserNotificationSetting,
    // updateUserPauseSettings, // Removed
} from "@/lib/actions/notificationSettings";
import {
    EntityType,
    NotificationType,
    // notificationTypeValues, // No longer needed here as we use summaryNotificationTypes
    UserPrivate, // Ensure UserPrivate is imported if used for setUserPrivateData
    summaryNotificationTypes, // Import for iteration
    summaryNotificationTypeDetails, // For labels
    SummaryNotificationType, // Type for summary keys
} from "@/models/models";
import { useToast } from "@/components/ui/use-toast";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";

interface NotificationSettingsDialogProps {
    entityType: EntityType;
    entityId: string;
    className?: string;
}

type EntitySpecificSettings = Record<NotificationType, { isEnabled: boolean; isConfigurable: boolean }>;

const getNotificationTypeLabel = (type: NotificationType): string => {
    return type
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
};

const getAllNotificationsOff = (settings: EntitySpecificSettings | null): boolean => {
    if (!settings) {
        return false;
    }

    return Object.values(settings)
        .filter((setting) => setting.isConfigurable)
        .every((setting) => !setting.isEnabled);
};

export const NotificationSettingsDialog: React.FC<NotificationSettingsDialogProps> = ({
    entityType,
    entityId,
    className,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [userPrivateData, setUserPrivateData] = useAtom(userAtom);
    const entitySettingsFromAtom = userPrivateData?.notificationSettings?.[entityType]?.[entityId];
    const [localSettings, setLocalSettings] = useState<EntitySpecificSettings | null>(null); // This will now hold summary types
    const [allNotificationsOff, setAllNotificationsOff] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isMasterToggleLoading, setIsMasterToggleLoading] = useState(false);
    // const [isPauseLoading, setIsPauseLoading] = useState(false); // Removed
    const [error, setError] = useState<string | null>(null);
    const [missingSettingsMessage, setMissingSettingsMessage] = useState<string | null>(null);
    const { toast } = useToast();

    // const pauseDurations = [ ... ]; // Removed

    // const [selectedGlobalPause, setSelectedGlobalPause] = useState("0"); // Removed
    // const [selectedCategoryPauses, setSelectedCategoryPauses] = useState<Record<string, string>>({}); // Removed

    useEffect(() => {
        if (isOpen) {
            // Pause-related useEffect logic removed

            if (entitySettingsFromAtom) {
                setLocalSettings(entitySettingsFromAtom);
                setAllNotificationsOff(getAllNotificationsOff(entitySettingsFromAtom));
                setError(null);
                setMissingSettingsMessage(null);
            } else if (userPrivateData) {
                setLocalSettings(null);
                setAllNotificationsOff(false);
                setError(null);
                setMissingSettingsMessage("Notification settings are not available for this item yet.");
            } else {
                setError("User data not available. Cannot load notification settings.");
                setLocalSettings(null);
                setAllNotificationsOff(false);
                setMissingSettingsMessage(null);
            }
        }
    }, [isOpen, userPrivateData, entitySettingsFromAtom, entityType, entityId]);

    const updateUserAtomSettings = (nextEntitySettings: EntitySpecificSettings) => {
        setUserPrivateData((prev) => {
            if (!prev) {
                return prev;
            }

            return {
                ...prev,
                notificationSettings: {
                    ...(prev.notificationSettings ?? {}),
                    [entityType]: {
                        ...(prev.notificationSettings?.[entityType] ?? {}),
                        [entityId]: nextEntitySettings,
                    },
                } as UserPrivate["notificationSettings"],
            };
        });
    };

    const handleSettingChange = async (type: NotificationType, checked: boolean) => {
        if (!localSettings) return;
        const previousLocalSettings = localSettings;
        const originalSettingState = localSettings[type];
        const nextLocalSettings = {
            ...localSettings,
            [type]: { ...localSettings[type], isEnabled: checked },
        };
        setLocalSettings(nextLocalSettings);
        setAllNotificationsOff(getAllNotificationsOff(nextLocalSettings));

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
                const revertedSettings = { ...previousLocalSettings, [type]: originalSettingState };
                setLocalSettings(revertedSettings);
                setAllNotificationsOff(getAllNotificationsOff(revertedSettings));
            } else {
                toast({
                    title: "Success",
                    description: `${getNotificationTypeLabel(type)} setting updated.`,
                });
                updateUserAtomSettings(nextLocalSettings);
            }
        } catch (e) {
            toast({
                title: "Error",
                description: "An unexpected error occurred.",
                variant: "destructive",
            });
            const revertedSettings = { ...previousLocalSettings, [type]: originalSettingState };
            setLocalSettings(revertedSettings);
            setAllNotificationsOff(getAllNotificationsOff(revertedSettings));
        } finally {
            setIsLoading(false);
        }
    };

    // Grouping logic removed as we'll have a flat list based on summaryNotificationTypes
    // const configurableSettings = ...
    // const groupedConfigurableSettings = ...

    const handleMasterToggleChange = async (checked: boolean) => {
        if (!localSettings) return;
        setIsMasterToggleLoading(true);

        const newSettingsState = { ...localSettings };
        const updatePromises: Promise<any>[] = [];

        // Iterate over the summary types that are expected to be in localSettings
        Object.keys(localSettings).forEach((key) => {
            const type = key as SummaryNotificationType; // Assuming localSettings keys are SummaryNotificationType
            if (localSettings[type]?.isConfigurable) {
                // If master toggle is "off all" (checked=true), we set individual to false.
                // If master toggle is "on all" (checked=false), we set individual to true.
                if (localSettings[type].isEnabled === checked) {
                    // Only update if current state is opposite of target
                    newSettingsState[type] = { ...localSettings[type], isEnabled: !checked };
                    updatePromises.push(
                        updateUserNotificationSetting({
                            entityType,
                            entityId,
                            notificationType: type, // Send the summary type
                            isEnabled: !checked,
                        }),
                    );
                }
            }
        });
        setLocalSettings(newSettingsState);
        setAllNotificationsOff(getAllNotificationsOff(newSettingsState));

        try {
            const results = await Promise.all(updatePromises);
            const errors = results.filter((r) => "error" in r);
            if (errors.length > 0) {
                toast({
                    title: "Error",
                    description: `Failed to update some settings: ${errors.map((e) => e.error).join(", ")}`,
                    variant: "destructive",
                });
            } else if (updatePromises.length > 0) {
                toast({
                    title: "Success",
                    description: `All notification settings updated.`,
                });
                updateUserAtomSettings(newSettingsState);
            }
        } catch (e) {
            toast({
                title: "Error",
                description: "An unexpected error occurred while updating all settings.",
                variant: "destructive",
            });
        } finally {
            setIsMasterToggleLoading(false);
        }
    };

    // handleGlobalPauseChange and handleCategoryPauseChange removed

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <NotificationBellIcon className={className} />
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Notification Settings</DialogTitle>
                    <DialogDescription>Manage notifications for this circle.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="mb-3 flex items-center justify-between border-b pb-3">
                        <Label htmlFor="master-toggle" className="text-sm font-medium">
                            Turn off all notifications
                        </Label>
                        <Switch
                            id="master-toggle"
                            checked={allNotificationsOff}
                            onCheckedChange={handleMasterToggleChange}
                            className="origin-right scale-75 transform"
                        />
                    </div>

                    {/* Pause all notifications Select removed */}

                    {error && <p className="text-sm text-destructive">{error}</p>}
                    {missingSettingsMessage && <p className="text-sm text-muted-foreground">{missingSettingsMessage}</p>}

                    {!error && localSettings && (
                        <div className="grid gap-4">
                            {summaryNotificationTypes.map((summaryNt) => {
                                const setting = localSettings[summaryNt as NotificationType];
                                const detail = summaryNotificationTypeDetails[summaryNt as SummaryNotificationType];
                                if (!setting || !detail) return null; // Only render if setting exists for this summary type

                                return (
                                    <div key={summaryNt} className="flex items-center justify-between">
                                        <Label
                                            htmlFor={`${entityId}-${summaryNt}-dialog`}
                                            className={`pr-2 text-sm font-normal ${allNotificationsOff ? "text-muted-foreground" : ""}`}
                                        >
                                            {detail.label}
                                        </Label>
                                        <Switch
                                            id={`${entityId}-${summaryNt}-dialog`}
                                            checked={setting.isEnabled}
                                            onCheckedChange={(checked) =>
                                                handleSettingChange(summaryNt as NotificationType, checked)
                                            }
                                            disabled={
                                                !setting.isConfigurable ||
                                                isLoading ||
                                                allNotificationsOff ||
                                                isMasterToggleLoading
                                            }
                                            className="origin-right scale-75 transform"
                                        />
                                    </div>
                                );
                            })}
                            {Object.keys(localSettings).length === 0 && (
                                <p className="text-sm text-muted-foreground">
                                    No configurable notifications for this item based on enabled modules.
                                </p>
                            )}
                        </div>
                    )}
                    {!isLoading && !isMasterToggleLoading && !error && !missingSettingsMessage && !localSettings && (
                        <p className="text-sm text-muted-foreground">
                            No notification settings available or user data not loaded.
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
