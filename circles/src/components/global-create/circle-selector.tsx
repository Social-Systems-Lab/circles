"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { Circle, UserPrivate, Feature } from "@/models/models"; // Added Feature import
import { CreatableItemDetail } from "./global-create-dialog-content";
import { features, modules as moduleInfos } from "@/lib/data/constants";
import { isAuthorized } from "@/lib/auth/client-auth"; // Assuming this can be used or adapted
import { Label } from "../ui/label";

interface CircleSelectorProps {
    itemType: CreatableItemDetail;
    onCircleSelected: (circle: Circle | null) => void;
    initialSelectedCircleId?: string;
    // We might need to pass down the full list of user's circles/memberships to avoid re-fetching
    // For now, let's assume we fetch/derive it here.
}

export const CircleSelector: React.FC<CircleSelectorProps> = ({
    itemType,
    onCircleSelected,
    initialSelectedCircleId,
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
        const potentialCircles: Circle[] = [...allUserMemberships.map((mem) => mem.circle)].filter(Boolean);

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
                // User's own circle: always allow selection, message will indicate if module needs enabling.
                // Permission is implicitly true for user's own circle for creatable items.
                return true;
            } else {
                // Other circles: module must be enabled, and user must have permission.
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
            setSelectedCircleId(undefined);
        }

        onCircleSelected(initialSelectedCircle);
        updateModuleEnableMessage(initialSelectedCircle, currentUserCircle);
        setIsLoading(false);
    }, [user, itemType, onCircleSelected]); // onCircleSelected is stable due to useCallback in parent

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

    if (isLoading) {
        return <div className="p-4 text-sm text-muted-foreground">Loading circles...</div>;
    }

    // itemType might be null briefly if parent component is setting up
    if (!itemType) {
        return <div className="p-4 text-sm text-muted-foreground">Initializing...</div>;
    }

    const moduleName = moduleInfos.find((m) => m.handle === itemType.moduleHandle)?.name || itemType.moduleHandle;

    if (selectableCircles.length === 0) {
        return (
            <div className="p-4 text-sm text-red-600">
                {`No valid circles found to create a ${itemType.key}. Ensure the '${moduleName}' module is enabled in a circle you belong to and you have permission, or select your user profile.`}
            </div>
        );
    }

    return (
        <div>
            <Label htmlFor="circle-select">Create in:</Label>
            <Select value={selectedCircleId} onValueChange={handleSelectionChange}>
                <SelectTrigger id="circle-select" className="mt-2 w-full">
                    <SelectValue placeholder="Select a circle..." />
                </SelectTrigger>
                <SelectContent>
                    {selectableCircles.map((circle) => (
                        <SelectItem key={circle._id} value={circle._id}>
                            {/* TODO: Add CirclePicture here */}
                            {circle.name || circle.handle}{" "}
                            {circle._id === user?._id ? "(Your User Profile)" : `(${circle.circleType || "Circle"})`}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {showEnableModuleMessage && (
                <p className="mt-2 text-xs text-blue-600">
                    The &quot;{moduleName}&quot; module is not currently enabled on your user profile. It will be
                    enabled automatically if you proceed.
                </p>
            )}
        </div>
    );
};

export default CircleSelector;
