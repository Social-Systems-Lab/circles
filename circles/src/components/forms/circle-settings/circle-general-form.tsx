"use client";

import { Circle } from "@/models/models";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteCircleButton } from "./delete-circle-button";
import { isAuthorized } from "@/lib/auth/client-auth";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { features } from "@/lib/data/constants";

interface CircleGeneralFormProps {
    circle: Circle;
}

export function CircleGeneralForm({ circle }: CircleGeneralFormProps) {
    const [user] = useAtom(userAtom);
    const isAdmin = isAuthorized(user, circle, features.settings.edit_critical_settings);

    return (
        <div className="formatted space-y-6">
            {isAdmin && (
                <Card>
                    <CardHeader>
                        <CardTitle>Danger Zone</CardTitle>
                        <CardDescription>These actions are destructive and cannot be undone</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DeleteCircleButton circle={circle} />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
