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
    UserPrivate,
    SummaryNotificationType,
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
type LaunchFacingNotificationRow = {
    label: string;
    summaryTypes: SummaryNotificationType[];
};

const launchFacingNotificationRows: LaunchFacingNotificationRow[] = [
    { label: "Tasks & Help", summaryTypes: ["TASKS_ALL"] },
    {
        label: "Project & Circle Activity",
        summaryTypes: ["GOALS_ALL", "PROPOSALS_ALL", "ISSUES_ALL"],
    },
    { label: "Account & System", summaryTypes: ["ACCOUNT_ALL"] },
];

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

    const handleLaunchFacingSettingChange = async (row: LaunchFacingNotificationRow, checked: boolean) => {
        if (!localSettings) return;

        const mappedSummaryTypes = row.summaryTypes.filter((type) => localSettings[type]);
        if (mappedSummaryTypes.length === 0) {
            return;
        }

        const nextLocalSettings = { ...localSettings };
        const updatePromises: Promise<any>[] = [];

        mappedSummaryTypes.forEach((type) => {
            nextLocalSettings[type] = { ...localSettings[type], isEnabled: checked };
            updatePromises.push(
                updateUserNotificationSetting({
                    entityType,
                    entityId,
                    notificationType: type,
                    isEnabled: checked,
                }),
            );
        });

        setLocalSettings(nextLocalSettings);
        setAllNotificationsOff(getAllNotificationsOff(nextLocalSettings));
        updateUserAtomSettings(nextLocalSettings);
        setIsLoading(true);

        try {
            const results = await Promise.all(updatePromises);
            const errors = results.filter((result) => "error" in result);
            if (errors.length > 0) {
                toast({
                    title: "Error",
                    description: `Failed to update some settings: ${errors.map((result) => result.error).join(", ")}`,
                    variant: "destructive",
                });
            } else if (updatePromises.length > 0) {
                toast({
                    title: "Success",
                    description: `${row.label} setting updated.`,
                });
            }
        } catch (e) {
            toast({
                title: "Error",
                description: "An unexpected error occurred.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const visibleLaunchFacingRows =
        localSettings == null
            ? []
            : launchFacingNotificationRows.filter((row) =>
                  row.summaryTypes.some((type) => localSettings[type] !== undefined),
              );

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
                            {visibleLaunchFacingRows.map((row) => {
                                const mappedSettings = row.summaryTypes
                                    .map((type) => localSettings[type])
                                    .filter(
                                        (setting): setting is EntitySpecificSettings[NotificationType] =>
                                            setting !== undefined,
                                    );
                                if (mappedSettings.length === 0) return null;

                                const isEnabled = mappedSettings.some((setting) => setting.isEnabled);
                                const isConfigurable = mappedSettings.some((setting) => setting.isConfigurable);
                                const rowId = `${entityId}-${row.summaryTypes.join("-")}-dialog`;

                                return (
                                    <div key={row.label} className="flex items-center justify-between">
                                        <Label
                                            htmlFor={rowId}
                                            className={`pr-2 text-sm font-normal ${allNotificationsOff ? "text-muted-foreground" : ""}`}
                                        >
                                            {row.label}
                                        </Label>
                                        <Switch
                                            id={rowId}
                                            checked={isEnabled}
                                            onCheckedChange={(checked) =>
                                                handleLaunchFacingSettingChange(row, checked)
                                            }
                                            disabled={
                                                !isConfigurable ||
                                                isLoading ||
                                                allNotificationsOff ||
                                                isMasterToggleLoading
                                            }
                                            className="origin-right scale-75 transform"
                                        />
                                    </div>
                                );
                            })}
                            {visibleLaunchFacingRows.length === 0 && (
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
