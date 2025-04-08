// circle-tabs.tsx

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { useMemo, useCallback, useEffect, useState, useRef } from "react";
import type { Circle, Module } from "@/models/models";
import { features, getFeature, LOG_LEVEL_TRACE, logLevel, modules } from "@/lib/data/constants";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

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
            let allowedUserGroups =
                circle.accessRules?.[moduleHandle]?.view || getFeature(moduleHandle, "view")?.defaultUserGroups || [];
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
        return enabledModules
            .filter((moduleHandle) => {
                let m = modules.find((x) => x.handle === moduleHandle);
                return m && hasAccess(moduleHandle);
            })
            .map((moduleHandle) => modules.find((x) => x.handle === moduleHandle)!);
    }, [enabledModules, hasAccess]);

    const [visibleTabs, setVisibleTabs] = useState<Module[]>([]);
    const [hiddenTabs, setHiddenTabs] = useState<Module[]>([]);
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    const tabsContainerRef = useRef<HTMLDivElement>(null);
    const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
    const moreButtonRef = useRef<HTMLButtonElement>(null);

    // Generate the correct path for a module based on default circle status
    const getPath = useCallback(
        (moduleHandle: string) => {
            if (moduleHandle === "settings") {
                return `/circles/${circle.handle}/${moduleHandle}/about`;
            }

            return `/circles/${circle.handle}/${moduleHandle}`;
        },
        [circle.handle],
    );

    const activeModule = useMemo(() => {
        return visibleModules.find((module) => pathname.startsWith(getPath(module.handle)));
    }, [visibleModules, pathname, getPath]);

    useEffect(() => {
        const calculateVisibleTabs = () => {
            if (!tabsContainerRef.current || visibleModules.length === 0) {
                setVisibleTabs(visibleModules);
                setHiddenTabs([]);
                return;
            }

            const containerWidth = tabsContainerRef.current.offsetWidth;
            let currentWidth = 0;
            const newVisibleTabs: Module[] = [];
            const newHiddenTabs: Module[] = [];
            const moreButtonWidthEstimate = moreButtonRef.current?.offsetWidth || 100; // Estimate width if not rendered yet

            tabRefs.current = tabRefs.current.slice(0, visibleModules.length); // Ensure refs array matches modules

            visibleModules.forEach((module, index) => {
                const tabElement = tabRefs.current[index];
                const tabWidth = tabElement?.offsetWidth || 100; // Estimate if not measured yet

                // Check if adding the next tab OR the more button would exceed width
                const potentialWidthWithMore =
                    currentWidth + tabWidth + (newHiddenTabs.length > 0 ? 0 : moreButtonWidthEstimate);

                if (potentialWidthWithMore <= containerWidth || newVisibleTabs.length === 0) {
                    // Always show at least one tab if possible
                    newVisibleTabs.push(module);
                    currentWidth += tabWidth;
                } else {
                    newHiddenTabs.push(module);
                }
            });

            // If all tabs fit initially, but adding the 'More' button would cause overflow later
            if (newHiddenTabs.length === 0 && currentWidth > containerWidth) {
                // Move the last visible tab to hidden
                const lastVisible = newVisibleTabs.pop();
                if (lastVisible) {
                    newHiddenTabs.unshift(lastVisible); // Add to beginning of hidden
                }
            }

            setVisibleTabs(newVisibleTabs);
            setHiddenTabs(newHiddenTabs);
        };

        calculateVisibleTabs(); // Initial calculation

        const resizeObserver = new ResizeObserver(calculateVisibleTabs);
        if (tabsContainerRef.current) {
            resizeObserver.observe(tabsContainerRef.current);
        }

        // Recalculate when modules change
        calculateVisibleTabs();

        return () => {
            if (tabsContainerRef.current) {
                resizeObserver.unobserve(tabsContainerRef.current);
            }
            resizeObserver.disconnect();
        };
    }, [visibleModules, pathname]); // Rerun when modules or path changes

    const activeTabInMore = hiddenTabs.find((module) => pathname.startsWith(getPath(module.handle)));

    return (
        <div>
            <div className="mx-auto max-w-6xl px-4 pt-2">
                <nav ref={tabsContainerRef} className="flex items-center gap-1 overflow-hidden" aria-label="Tabs">
                    {visibleTabs.map((module, index) => {
                        const modulePath = getPath(module.handle);
                        const isActive = pathname.startsWith(modulePath);

                        return (
                            <Link
                                key={module.handle}
                                ref={(el) => {
                                    tabRefs.current[index] = el;
                                }}
                                href={modulePath}
                                className={cn(
                                    "whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-medium",
                                    isActive
                                        ? "border-b-2 border-primary text-primary"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                )}
                            >
                                {module.name}
                            </Link>
                        );
                    })}

                    {hiddenTabs.length > 0 && (
                        <DropdownMenu open={isMoreMenuOpen} onOpenChange={setIsMoreMenuOpen}>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    ref={moreButtonRef}
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                        "flex items-center gap-1 rounded-b-none rounded-t-lg px-4 py-2 text-sm font-medium",
                                        activeTabInMore
                                            ? "border-b-2 border-primary text-primary"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                        isMoreMenuOpen && "bg-muted", // Indicate open state
                                    )}
                                >
                                    {activeTabInMore ? activeTabInMore.name : "More"}
                                    <ChevronDown
                                        className={cn("h-4 w-4 transition-transform", isMoreMenuOpen && "rotate-180")}
                                    />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {hiddenTabs.map((module) => {
                                    const modulePath = getPath(module.handle);
                                    const isActive = pathname.startsWith(modulePath);
                                    return (
                                        <DropdownMenuItem key={module.handle} asChild>
                                            <Link
                                                href={modulePath}
                                                className={cn("w-full", isActive && "font-semibold text-primary")}
                                            >
                                                {module.name}
                                            </Link>
                                        </DropdownMenuItem>
                                    );
                                })}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </nav>
            </div>
        </div>
    );
}
