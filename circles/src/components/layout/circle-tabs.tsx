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
        // loop through all modules and check if they are enabled for the circle
        let moduleList: string[] = [];
        if (!circle.enabledModules) {
            return moduleList;
        }

        for (let moduleHandle of modules.map((m) => m.handle)) {
            let isModuleEnabled = circle.enabledModules.includes(moduleHandle);
            if (isModuleEnabled && hasAccess(moduleHandle)) {
                moduleList.push(moduleHandle);
            }
        }
        return moduleList;
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
            // Get the actual width if possible, otherwise estimate
            const moreButtonWidth = moreButtonRef.current?.offsetWidth || 100;

            tabRefs.current = tabRefs.current.slice(0, visibleModules.length); // Ensure refs array matches modules

            // Determine which tabs fit
            for (let i = 0; i < visibleModules.length; i++) {
                const tabModule = visibleModules[i];
                const tabElement = tabRefs.current[i];
                // Use offsetWidth if available, otherwise estimate
                const tabWidth = tabElement?.offsetWidth || 100;

                // Calculate width needed *if* this tab is added AND a "More" button is potentially needed later
                // A "More" button is needed if this isn't the last tab OR if we already decided previous tabs must be hidden
                const requiresMoreButton = i < visibleModules.length - 1 || newHiddenTabs.length > 0;
                // Calculate the potential total width IF this tab remains visible
                // Add the 'more' button width only if we anticipate needing it (i.e., if this isn't the last possible visible tab)
                const potentialTotalWidth = currentWidth + tabWidth + (requiresMoreButton ? moreButtonWidth : 0);

                if (potentialTotalWidth <= containerWidth || newVisibleTabs.length === 0) {
                    // Ensure at least one tab is visible if possible
                    newVisibleTabs.push(tabModule);
                    currentWidth += tabWidth;
                } else {
                    // This tab and all remaining tabs go into the hidden list
                    newHiddenTabs.push(...visibleModules.slice(i));
                    break; // No need to check further tabs
                }
            }

            // Final check: If we have hidden tabs, ensure the visible tabs + More button fit.
            // If not, move visible tabs to hidden until it fits.
            while (
                newHiddenTabs.length > 0 &&
                newVisibleTabs.length > 0 && // Keep at least one visible tab if possible
                currentWidth + moreButtonWidth > containerWidth
            ) {
                const lastVisible = newVisibleTabs.pop();
                if (lastVisible) {
                    const lastVisibleElement = tabRefs.current[newVisibleTabs.length]; // Get ref of the moved tab
                    const lastVisibleWidth = lastVisibleElement?.offsetWidth || 100;
                    currentWidth -= lastVisibleWidth; // Subtract its width
                    newHiddenTabs.unshift(lastVisible); // Add to the beginning of hidden tabs
                } else {
                    break; // Should not happen if newVisibleTabs.length > 0
                }
            }

            setVisibleTabs(newVisibleTabs);
            setHiddenTabs(newHiddenTabs);
        };

        calculateVisibleTabs(); // Initial calculation

        const resizeObserver = new ResizeObserver(() => {
            // Debounce or throttle might be good here in a real app
            calculateVisibleTabs();
        });
        let observedElement = tabsContainerRef.current; // Capture the value for cleanup

        if (observedElement) {
            resizeObserver.observe(observedElement);
        }

        // Also recalculate when modules change (e.g., permissions change)
        // No need to call calculateVisibleTabs() again here, ResizeObserver handles initial size

        return () => {
            if (observedElement) {
                resizeObserver.unobserve(observedElement);
            }
            resizeObserver.disconnect();
        };
    }, [visibleModules, getPath]); // Rerun when modules list changes or getPath changes (circle handle)

    const activeTabInMore = hiddenTabs.find((module) => pathname.startsWith(getPath(module.handle)));

    return (
        <div>
            <div className="mx-auto max-w-6xl px-4 pt-2">
                <nav ref={tabsContainerRef} className="flex items-center gap-1 overflow-hidden" aria-label="Tabs">
                    {visibleTabs.map((tabModule, index) => {
                        const modulePath = getPath(tabModule.handle);
                        const isActive = pathname.startsWith(modulePath);

                        return (
                            <Link
                                key={tabModule.handle}
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
                                {tabModule.name}
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
                                {hiddenTabs.map((tabModule) => {
                                    const modulePath = getPath(tabModule.handle);
                                    const isActive = pathname.startsWith(modulePath);
                                    return (
                                        <DropdownMenuItem key={tabModule.handle} asChild>
                                            <Link
                                                href={modulePath}
                                                className={cn("w-full", isActive && "font-semibold text-primary")}
                                            >
                                                {tabModule.name}
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
