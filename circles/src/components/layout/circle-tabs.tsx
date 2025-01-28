// circle-tabs.tsx

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { useMemo, useCallback } from "react";
import type { Circle, Page } from "@/models/models";

type CircleTabsProps = {
    circle: Circle;
    isDefaultCircle: boolean;
};

export function CircleTabs({ circle, isDefaultCircle }: CircleTabsProps) {
    const pathname = usePathname();
    const [user] = useAtom(userAtom);

    // Determine user's access groups for the current circle
    const userGroups = useMemo(() => {
        const membership = user?.memberships.find((m) => m.circleId === circle?._id);
        return membership ? membership.userGroups : [];
    }, [user, circle?._id]);

    // Check if the user has access to a specific page
    const hasAccess = useCallback(
        (page: Page) => {
            const allowedUserGroups = circle.accessRules?.[`__page_${page.handle}`] || [];
            return (
                allowedUserGroups.includes("everyone") || userGroups.some((group) => allowedUserGroups.includes(group))
            );
        },
        [circle.accessRules, userGroups],
    );

    // Filter pages based on user access
    const authorizedPages = useMemo(() => circle?.pages?.filter(hasAccess) ?? [], [circle.pages, hasAccess]);

    // Generate the correct path for a page based on default circle status
    const getPath = useCallback(
        (page: Page) => {
            if (isDefaultCircle) {
                return `/${page.handle}`;
            } else {
                return `/circles/${circle.handle}${page.handle ? `/${page.handle}` : ""}`;
            }
        },
        [isDefaultCircle, circle.handle],
    );

    return (
        <div>
            <div className="mx-auto max-w-6xl px-4 pt-2">
                <nav className="flex gap-1" aria-label="Tabs">
                    {authorizedPages.map((page) => {
                        const pagePath = getPath(page);
                        const isActive = page.handle === "" ? pathname === pagePath : pathname.startsWith(pagePath);

                        return (
                            <Link
                                key={page.handle}
                                href={pagePath}
                                className={cn(
                                    "rounded-t-lg px-4 py-2 text-sm font-medium",
                                    isActive
                                        ? "border-b-2 border-primary text-primary"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                )}
                            >
                                {page.name}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
