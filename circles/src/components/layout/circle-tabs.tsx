// circle-tabs.tsx

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { useMemo, useCallback, useEffect } from "react";
import type { Circle } from "@/models/models";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { modules } from "@/components/modules/modules";

type CircleTabsProps = {
    circle: Circle;
};

export function CircleTabs({ circle }: CircleTabsProps) {
    const pathname = usePathname();
    const [user] = useAtom(userAtom);

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.CircleTab.1");
        }
    }, []);

    // Determine user's access groups for the current circle
    const userGroups = useMemo(() => {
        const membership = user?.memberships.find((m) => m.circleId === circle?._id);
        return membership ? membership.userGroups : [];
    }, [user, circle?._id]);

    // Check if the user has access to a specific module
    const hasAccess = useCallback(
        (moduleHandle: string) => {
            const allowedUserGroups = circle.accessRules?.[moduleHandle].view || [];
            return (
                allowedUserGroups.includes("everyone") || userGroups.some((group) => allowedUserGroups.includes(group))
            );
        },
        [circle.accessRules, userGroups],
    );

    const enabledModules = useMemo(() => {
        return circle.enabledModules ?? [];
    }, [circle.enabledModules]);

    // Filter modules based on enabledModules and excludeFromMenu
    const visibleModules = useMemo(() => {
        return Object.values(modules).filter(
            (module) => enabledModules.includes(module.handle) && !module.excludeFromMenu && hasAccess(module.handle),
        );
    }, [enabledModules, hasAccess]);

    // Generate the correct path for a module based on default circle status
    const getPath = useCallback(
        (moduleHandle: string) => {
            return `/circles/${circle.handle}/${moduleHandle}`;
        },
        [circle.handle],
    );

    return (
        <div>
            <div className="mx-auto max-w-6xl px-4 pt-2">
                <nav className="flex gap-1" aria-label="Tabs">
                    {visibleModules.map((module) => {
                        const modulePath = getPath(module.handle);
                        const isActive = pathname.startsWith(modulePath);

                        return (
                            <Link
                                key={module.handle}
                                href={modulePath}
                                className={cn(
                                    "rounded-t-lg px-4 py-2 text-sm font-medium",
                                    isActive
                                        ? "border-b-2 border-primary text-primary"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                )}
                            >
                                {module.name}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
