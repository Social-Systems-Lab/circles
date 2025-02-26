"use client";

import Link from "next/link";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HiChevronDown } from "react-icons/hi";
import { Circle, Page } from "@/models/models";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

export default function TopBarNavItems({ circle, isDefaultCircle }: { circle: Circle; isDefaultCircle: boolean }) {
    const itemContainerRef = useRef<HTMLDivElement | null>(null);
    const itemRefs = useRef<React.RefObject<HTMLDivElement | null>[]>(
        circle?.pages?.map(() => React.createRef()) ?? [],
    );
    const pathname = usePathname();
    const [itemVisibility, setItemVisibility] = useState<boolean[]>([]);
    const [navMenuOpen, setNavMenuOpen] = useState(false);

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.TopBarNavItems.1");
        }
    }, []);

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

    const currentNavItem = useMemo(() => {
        return circle?.pages?.find((x) => {
            if (x.handle === "") {
                return pathname === getPath(x);
            }
            return pathname.startsWith(getPath(x));
        });
    }, [circle.pages, getPath, pathname]);
    const currentNavVisible = useMemo(() => {
        if (!currentNavItem) return false;
        return itemVisibility[circle?.pages?.indexOf(currentNavItem) ?? 0];
    }, [currentNavItem, circle.pages, itemVisibility]);

    const recalculateItemVisibility = () => {
        if (!itemContainerRef.current) return;

        let newItemVisibility: boolean[] = [];

        // calculate visible and hidden items
        const containerWidth = itemContainerRef.current?.offsetWidth || 0;
        let currentWidth = 0;
        circle?.pages?.forEach((item, index) => {
            const itemWidth = item.name.length * 13; // estimate width, TODO find better way
            if (currentWidth + itemWidth <= containerWidth) {
                newItemVisibility.push(true);
                currentWidth += itemWidth;
            } else {
                newItemVisibility.push(false);
                if (index > 0) {
                    newItemVisibility[index - 1] = false;
                }
            }
        });

        setItemVisibility(newItemVisibility);
    };

    useEffect(() => {
        const resizeObserver = new ResizeObserver((entries) => {
            recalculateItemVisibility();
        });

        if (itemContainerRef.current) {
            resizeObserver.observe(itemContainerRef.current);
        }

        recalculateItemVisibility();

        return () => resizeObserver.disconnect();
    }, []);

    return (
        <nav ref={itemContainerRef} className={`mr-8 flex h-[60px] flex-1 flex-row overflow-hidden`}>
            {circle?.pages?.map((item, index) => (
                <Link key={item.handle} href={getPath(item)}>
                    <div
                        ref={itemRefs.current[index]}
                        className={`flex h-full flex-shrink-0 cursor-pointer flex-row items-center justify-center pl-2 pr-2 ${
                            item === currentNavItem ? "border-b-2 border-red-500" : "border-b-2 border-transparent"
                        } ${!itemVisibility[index] ? "hidden" : ""}`}
                    >
                        <div>
                            <p className="m-0 mt-[1px]">{item.name}</p>
                        </div>
                    </div>
                </Link>
            ))}

            <Popover open={navMenuOpen} onOpenChange={setNavMenuOpen}>
                <PopoverTrigger>
                    <div
                        className={`flex h-full flex-shrink-0 cursor-pointer flex-row items-center justify-center pl-2 pr-2 ${
                            !currentNavVisible ? "border-b-2 border-red-500" : "border-b-2 border-transparent"
                        } ${itemVisibility.includes(false) ? "" : "hidden"}`}
                    >
                        <span className="mr-[2px]">{!currentNavVisible ? currentNavItem?.name : "More"}</span>
                        <HiChevronDown size="16px" />
                    </div>

                    <div className={`cursor-pointer p-2 ${itemVisibility.includes(false) ? "" : "hidden"}`}>More</div>
                </PopoverTrigger>
                <PopoverContent className="ml-4 w-auto overflow-hidden p-0">
                    {circle?.pages
                        ?.filter((_, index) => !itemVisibility[index])
                        .map((item) => (
                            <Link key={item.handle} href={getPath(item)}>
                                <div
                                    className="cursor-pointer p-2 hover:bg-[#f0f0f0]"
                                    onClick={() => setNavMenuOpen(false)}
                                >
                                    {item.name}
                                </div>
                            </Link>
                        ))}
                </PopoverContent>
            </Popover>
        </nav>
    );
}
