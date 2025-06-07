"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { Circle, UserPrivate, Feature } from "@/models/models"; // Added Feature import
import { CreatableItemDetail } from "./global-create-dialog-content";
import { features, modules as moduleInfos } from "@/lib/data/constants";
import { isAuthorized } from "@/lib/auth/client-auth"; // Assuming this can be used or adapted
// import { Label } from "../ui/label"; // Label removed
import { CirclePicture } from "../modules/circles/circle-picture"; // Import CirclePicture
import { ChevronDown } from "lucide-react"; // Ensure ChevronDown is imported

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
            itemType && // Ensure itemType is defined
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
        // Ensure mem.circle is not null before adding to potentialCircles
        const potentialCircles: Circle[] = allUserMemberships
            .map((mem) => mem.circle)
            .filter((circle): circle is Circle => circle !== null && circle !== undefined);

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
            // If no initial circle could be determined, and there are selectable circles, select the first one.
            // Otherwise, if initialSelectedCircleId was provided but not found, it remains undefined.
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

    return (
        <div className="flex flex-col">
            <Select value={selectedCircleId || ""} onValueChange={handleSelectionChange}>
                <SelectTrigger
                    id="circle-select"
                    className="h-auto justify-start border-0 p-1 text-xs hover:bg-gray-100 focus:ring-0 focus:ring-offset-0 data-[placeholder]:text-muted-foreground"
                >
                    {currentlySelectedCircle ? (
                        <div className="flex items-center gap-1">
                            <CirclePicture circle={currentlySelectedCircle} size="14px" />
                            <span className="truncate">{currentlySelectedCircle.name}</span>
                            <ChevronDown className="ml-auto h-3 w-3 opacity-50" />
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
            {showEnableModuleMessage && (
                <p className="mt-1 text-xs text-blue-600">The "{moduleName}" module will be enabled.</p>
            )}
        </div>
    );
};

export default CircleSelector;
