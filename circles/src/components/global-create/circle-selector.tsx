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
    // We might need to pass down the full list of user's circles/memberships to avoid re-fetching
    // For now, let's assume we fetch/derive it here.
}

export const CircleSelector: React.FC<CircleSelectorProps> = ({ itemType, onCircleSelected }) => {
    const [user] = useAtom(userAtom);
    const [validCircles, setValidCircles] = useState<Circle[]>([]);
    const [selectedCircleId, setSelectedCircleId] = useState<string | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setIsLoading(false);
            setValidCircles([]);
            return;
        }

        setIsLoading(true);
        const currentUserCircle = user as UserPrivate; // User's own circle data

        // Simulate fetching all circles user is part of.
        // In a real scenario, this would involve an API call or using existing memberships data.
        const allUserMemberships = currentUserCircle.memberships || [];
        const potentialCircles: Circle[] = [
            currentUserCircle, // User's own circle
            ...allUserMemberships.map((mem) => mem.circle), // Circles user is a member of
        ].filter(Boolean); // Filter out any undefined/null circles

        console.log("Potential circles:", potentialCircles);

        const filteredCircles = potentialCircles.filter((circle) => {
            if (!circle || !circle.handle) return false; // Basic check

            // 1. Check if module is enabled
            const moduleEnabled = circle.enabledModules?.includes(itemType.moduleHandle);
            if (!moduleEnabled) return false;

            console.log("Checking circle:", circle.name || circle.handle, "for itemType:", itemType.key);

            // 2. Check permission to create
            // The feature handle for creation is itemType.createFeatureHandle
            // The module handle is itemType.moduleHandle
            // We need to use a permission checking function like isAuthorized
            const featureToAuth = (features[itemType.moduleHandle as keyof typeof features] as any)?.[
                itemType.createFeatureHandle
            ];

            console.log("Feature to auth:", featureToAuth);

            if (!featureToAuth) return false; // Feature definition not found

            const canCreateInCircle = isAuthorized(user, circle, featureToAuth as Feature);

            console.log("canCreateInCircle:", canCreateInCircle);

            return canCreateInCircle;
        });

        setValidCircles(filteredCircles);

        // Pre-selection logic
        if (filteredCircles.length > 0) {
            const userOwnCircleIsValid = filteredCircles.find((c) => c._id === currentUserCircle._id);
            if (userOwnCircleIsValid) {
                setSelectedCircleId(currentUserCircle._id);
                onCircleSelected(currentUserCircle);
            } else {
                setSelectedCircleId(filteredCircles[0]._id);
                onCircleSelected(filteredCircles[0]);
            }
        } else {
            setSelectedCircleId(undefined);
            onCircleSelected(null);
        }
        setIsLoading(false);
    }, [user, itemType, onCircleSelected]);

    const handleSelectionChange = (circleId: string) => {
        const circle = validCircles.find((c) => c._id === circleId);
        setSelectedCircleId(circleId);
        onCircleSelected(circle || null);
    };

    if (isLoading) {
        return <div className="p-4 text-sm text-muted-foreground">Loading circles...</div>;
    }

    if (validCircles.length === 0) {
        const moduleName = moduleInfos.find((m) => m.handle === itemType.moduleHandle)?.name || itemType.moduleHandle;
        return (
            <div className="p-4 text-sm text-red-600">
                {`No valid circles found to create a ${itemType.key}. Ensure the '${moduleName}' module is enabled and you have permission.`}
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
                    {validCircles.map((circle) => (
                        <SelectItem key={circle._id} value={circle._id}>
                            {/* TODO: Add CirclePicture here */}
                            {circle.name || circle.handle} ({circle.circleType})
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
};

export default CircleSelector;
