"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { Circle, UserPrivate, Feature } from "@/models/models";
import { CreatableItemDetail } from "./global-create-dialog-content";
import { features, modules as moduleInfos } from "@/lib/data/constants";
import { isAuthorized } from "@/lib/auth/client-auth";
import { Label } from "../ui/label"; // Re-imported Label
import { CirclePicture } from "../modules/circles/circle-picture";
import { ChevronDown } from "lucide-react";

interface CircleSelectorProps {
    itemType: CreatableItemDetail;
    onCircleSelected: (circle: Circle | null) => void;
    initialSelectedCircleId?: string;
    variant?: "standard" | "condensed"; // New variant prop
}

export const CircleSelector: React.FC<CircleSelectorProps> = ({
    itemType,
    onCircleSelected,
    initialSelectedCircleId,
    variant = "standard", // Default to standard variant
}) => {
    const [user] = useAtom(userAtom);
    const [selectableCircles, setSelectableCircles] = useState<Circle[]>([]);
    const [selectedCircleId, setSelectedCircleId] = useState<string | undefined>(initialSelectedCircleId);
    const [isLoading, setIsLoading] = useState(true);
    const [showEnableModuleMessage, setShowEnableModuleMessage] = useState(false);

    const updateModuleEnableMessage = (selectedCircle: Circle | null, userCircle: UserPrivate | null) => {
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
    };

    useEffect(() => {
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
        const allUserMemberships = currentUserCircle.memberships || [];
        const potentialCircles: Circle[] = allUserMemberships
            .map((mem) => mem.circle)
            .filter((circle): circle is Circle => {
                if (!circle) return false;
                // Keep the user's own circle regardless of its type
                if (circle._id === currentUserCircle._id) return true;
                // For other circles, only include those of type 'circle'
                return circle.circleType === "circle" || circle.circleType === "project";
            });

        const featureToAuth = (features[itemType.moduleHandle as keyof typeof features] as any)?.[
            itemType.createFeatureHandle
        ];

        if (!featureToAuth) {
            console.warn(`Feature definition not found for ${itemType.moduleHandle} - ${itemType.createFeatureHandle}`);
            setSelectableCircles([]);
            setSelectedCircleId(undefined);
            onCircleSelected(null);
            setShowEnableModuleMessage(false);
            setIsLoading(false);
            return;
        }

        const filteredAndProcessedCircles = potentialCircles.filter((circle) => {
            if (!circle || !circle.handle) return false;

            if (circle._id === currentUserCircle._id) {
                return true;
            } else {
                const moduleEnabled = circle.enabledModules?.includes(itemType.moduleHandle);
                if (!moduleEnabled) return false;
                return isAuthorized(user, circle, featureToAuth as Feature);
            }
        });

        setSelectableCircles(filteredAndProcessedCircles);

        let initialSelectedCircle: Circle | null = null;

        if (initialSelectedCircleId) {
            const preselected = filteredAndProcessedCircles.find((c) => c._id === initialSelectedCircleId);
            if (preselected) {
                initialSelectedCircle = preselected;
            }
        }

        if (!initialSelectedCircle && filteredAndProcessedCircles.length > 0) {
            const userOwnCircleIsSelectable = filteredAndProcessedCircles.find((c) => c._id === currentUserCircle._id);
            if (userOwnCircleIsSelectable) {
                initialSelectedCircle = userOwnCircleIsSelectable;
            } else {
                initialSelectedCircle = filteredAndProcessedCircles[0];
            }
        }

        if (initialSelectedCircle) {
            setSelectedCircleId(initialSelectedCircle._id);
        } else {
            if (!initialSelectedCircleId && filteredAndProcessedCircles.length > 0) {
                initialSelectedCircle = filteredAndProcessedCircles[0];
                setSelectedCircleId(initialSelectedCircle._id);
            } else if (!initialSelectedCircleId) {
                setSelectedCircleId(undefined);
            }
        }

        onCircleSelected(initialSelectedCircle);
        updateModuleEnableMessage(initialSelectedCircle, currentUserCircle);
        setIsLoading(false);
    }, [user, itemType, onCircleSelected, initialSelectedCircleId]);

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

    if (selectableCircles.length === 0) {
        return <div className="p-1 text-xs text-red-500">{`No circles to create ${itemType.key}.`}</div>;
    }

    const standardTriggerClasses = "mt-2 w-full"; // Standard trigger with top margin
    const condensedTriggerClasses =
        "h-auto p-1 text-xs hover:bg-gray-100 focus:ring-0 focus:ring-offset-0 border-0 justify-start data-[placeholder]:text-muted-foreground";

    return (
        <div className="flex flex-col">
            {variant === "standard" && (
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
                <SelectContent className="z-[120]">
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
            {showEnableModuleMessage && (
                <p className={`mt-1 text-xs text-blue-600 ${variant === "condensed" ? "text-center" : ""}`}>
                    The &quot;{moduleName}&quot; module will be enabled.
                </p>
            )}
        </div>
    );
};

export default CircleSelector;
