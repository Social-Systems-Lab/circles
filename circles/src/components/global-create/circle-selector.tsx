"use client";

import React, { useCallback, useEffect, useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { Circle, UserPrivate } from "@/models/models";
import { CreatableItemDetail } from "./global-create-dialog-content";
import { modules as moduleInfos } from "@/lib/data/constants";
import { Label } from "../ui/label"; // Re-imported Label
import { CirclePicture } from "../modules/circles/circle-picture";
import { ChevronDown } from "lucide-react";
import { getSelectableCirclesAction } from "./actions";

interface CircleSelectorProps {
    itemType: CreatableItemDetail;
    onCircleSelected: (circle: Circle | null) => void;
    initialSelectedCircleId?: string;
    variant?: "standard" | "condensed"; // New variant prop
    showModuleEnableMessage?: boolean;
    showLabel?: boolean;
    fallbackCircle?: Circle;
}

export const CircleSelector: React.FC<CircleSelectorProps> = ({
    itemType,
    onCircleSelected,
    initialSelectedCircleId,
    variant = "standard", // Default to standard variant
    showModuleEnableMessage = true,
    showLabel = true,
    fallbackCircle,
}) => {
    const [user] = useAtom(userAtom);
    const [selectableCircles, setSelectableCircles] = useState<Circle[]>([]);
    const [selectedCircleId, setSelectedCircleId] = useState<string | undefined>(initialSelectedCircleId);
    const [isLoading, setIsLoading] = useState(true);
    const [showEnableModuleMessage, setShowEnableModuleMessage] = useState(false);

    const updateModuleEnableMessage = useCallback((selectedCircle: Circle | null, userCircle: UserPrivate | null) => {
        if (
            selectedCircle &&
            userCircle &&
            selectedCircle._id === userCircle._id &&
            itemType &&
            !selectedCircle.enabledModules?.includes(itemType.moduleHandle)
        ) {
            setShowEnableModuleMessage(true);
        } else {
            setShowEnableModuleMessage(false);
        }
    }, [itemType]);

    useEffect(() => {
        let cancelled = false;

        if (!user || !itemType) {
            setIsLoading(false);
            setSelectableCircles([]);
            setSelectedCircleId(undefined);
            onCircleSelected(null);
            setShowEnableModuleMessage(false);
            return;
        }

        setIsLoading(true);
        const currentUserCircle = user as UserPrivate;

        const loadSelectableCircles = async () => {
            const result = await getSelectableCirclesAction(itemType.moduleHandle, itemType.createFeatureHandle);
            if (cancelled) {
                return;
            }

            const availableCircles = result.success ? result.circles : [];
            if (
                fallbackCircle?._id &&
                initialSelectedCircleId === fallbackCircle._id &&
                !availableCircles.some((circle) => circle._id === fallbackCircle._id)
            ) {
                availableCircles.push(fallbackCircle);
            }
            setSelectableCircles(availableCircles);

            let initialSelectedCircle: Circle | null = null;

            if (initialSelectedCircleId) {
                const preselected = availableCircles.find((circle) => circle._id === initialSelectedCircleId);
                if (preselected) {
                    initialSelectedCircle = preselected;
                }
            }

            if (!initialSelectedCircle && availableCircles.length > 0) {
                initialSelectedCircle =
                    availableCircles.find((circle) => circle._id === currentUserCircle._id) || availableCircles[0];
            }

            setSelectedCircleId(initialSelectedCircle?._id);
            onCircleSelected(initialSelectedCircle);
            updateModuleEnableMessage(initialSelectedCircle, currentUserCircle);
            setIsLoading(false);
        };

        void loadSelectableCircles();

        return () => {
            cancelled = true;
        };
    }, [user, itemType, onCircleSelected, initialSelectedCircleId, fallbackCircle, updateModuleEnableMessage]);

    const handleSelectionChange = (circleId: string) => {
        const circle = selectableCircles.find((c) => c._id === circleId);
        setSelectedCircleId(circleId);
        onCircleSelected(circle || null);
        if (user && circle) {
            updateModuleEnableMessage(circle, user as UserPrivate);
        } else {
            setShowEnableModuleMessage(false);
        }
    };

    const currentlySelectedCircle = useMemo(() => {
        return selectableCircles.find((c) => c._id === selectedCircleId);
    }, [selectedCircleId, selectableCircles]);

    if (isLoading) {
        return <div className="p-1 text-xs text-muted-foreground">Loading...</div>;
    }

    if (!itemType) {
        return <div className="p-1 text-xs text-muted-foreground">Initializing...</div>;
    }

    const moduleName = moduleInfos.find((m) => m.handle === itemType.moduleHandle)?.name || itemType.moduleHandle;
    const showVerificationHint =
        selectableCircles.length === 1 &&
        selectableCircles[0]?._id === user?._id &&
        itemType.moduleHandle === "feed" &&
        itemType.createFeatureHandle === "post" &&
        !user?.isVerified;

    if (selectableCircles.length === 0) {
        return <div className="p-1 text-xs text-red-500">{`No circles to create ${itemType.key}.`}</div>;
    }

    const standardTriggerClasses = "mt-2 w-full"; // Standard trigger with top margin
    const condensedTriggerClasses =
        "h-auto p-1 text-xs hover:bg-gray-100 focus:ring-0 focus:ring-offset-0 border-0 justify-start data-[placeholder]:text-muted-foreground";

    return (
        <div className="flex flex-col">
            {showLabel && variant === "standard" && (
                <Label htmlFor="circle-select" className="mb-1 text-xs text-muted-foreground">
                    Create in:
                </Label>
            )}
            <Select value={selectedCircleId || ""} onValueChange={handleSelectionChange}>
                <SelectTrigger
                    id="circle-select"
                    className={variant === "condensed" ? condensedTriggerClasses : standardTriggerClasses}
                >
                    {currentlySelectedCircle ? (
                        <div className={`flex items-center gap-1 ${variant === "condensed" ? "w-full" : ""}`}>
                            <CirclePicture
                                circle={currentlySelectedCircle}
                                size={variant === "condensed" ? "14px" : "16px"}
                            />
                            <span className={`truncate ${variant === "condensed" ? "flex-grow" : ""}`}>
                                {currentlySelectedCircle.name}
                            </span>
                            {/* {variant === "condensed" && <ChevronDown className="h-3 w-3 opacity-50" />} */}
                            {/* Only show custom chevron in condensed, standard will use default */}
                        </div>
                    ) : (
                        <SelectValue placeholder="Select circle..." />
                    )}
                </SelectTrigger>
                <SelectContent>
                    {selectableCircles.map((circle) => (
                        <SelectItem key={circle._id} value={circle._id} className="text-xs">
                            <div className="flex items-center gap-2">
                                <CirclePicture circle={circle} size="16px" />
                                <span>{circle.name || circle.handle}</span>
                                {circle._id === user?._id && (
                                    <span className="text-xs text-muted-foreground">(You)</span>
                                )}
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {showModuleEnableMessage && showEnableModuleMessage && (
                <p className={`mt-1 text-xs text-blue-600 ${variant === "condensed" ? "text-center" : ""}`}>
                    The &quot;{moduleName}&quot; module will be enabled.
                </p>
            )}
            {showVerificationHint && (
                <p className={`mt-1 text-xs text-amber-700 ${variant === "condensed" ? "text-center" : ""}`}>
                    Verify your account to post in other circles where you have noticeboard access.
                </p>
            )}
        </div>
    );
};

export default CircleSelector;
