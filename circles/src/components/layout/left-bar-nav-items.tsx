"use client";

import Link from "next/link";
import React, { useState, useEffect, useRef, useMemo, useCallback, use } from "react";
import { usePathname } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HiChevronDown } from "react-icons/hi";
import { Circle, Page } from "@/models/models";
import { AiOutlineContacts, AiOutlineFile, AiOutlineHome, AiOutlineSetting } from "react-icons/ai";
import PageIcon from "../modules/page-icon";

export default function LeftBarNavItems({ circle, isDefaultCircle }: { circle: Circle; isDefaultCircle: boolean }) {
    const itemContainerRef = useRef<HTMLDivElement | null>(null);
    const itemRefs = useRef<React.RefObject<HTMLDivElement>[]>(circle?.pages?.map(() => React.createRef()) ?? []);
    const pathname = usePathname();
    const [itemVisibility, setItemVisibility] = useState<boolean[]>([]);
    const [navMenuOpen, setNavMenuOpen] = useState(false);

    useEffect(() => {
        console.log(JSON.stringify(circle?.pages, null, 2));
    }, [circle]);

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
        const containerHeight = itemContainerRef.current?.offsetHeight || 0;
        let currentHeight = 0;
        circle?.pages?.forEach((item, index) => {
            const itemHeight = 40; // TODO get actual height
            if (currentHeight + itemHeight <= containerHeight) {
                newItemVisibility.push(true);
                currentHeight += itemHeight;
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
        <nav ref={itemContainerRef} className={`flex w-[72px] flex-1 flex-col overflow-hidden`}>
            {circle?.pages?.map((item, index) => (
                <Link key={item.handle} href={getPath(item)}>
                    <div
                        ref={itemRefs.current[index]}
                        className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center pb-2 pt-2 ${
                            item === currentNavItem ? "text-[#495cff]" : "text-[#696969]"
                        } ${!itemVisibility[index] ? "hidden" : ""}`}
                    >
                        <PageIcon page={item} size="24px" />
                        <span className="mt-[4px] text-[11px]">{item.name}</span>
                    </div>
                </Link>
            ))}

            <Popover open={navMenuOpen} onOpenChange={setNavMenuOpen}>
                <PopoverTrigger>
                    <div
                        className={`flex h-full flex-shrink-0 cursor-pointer flex-row items-center justify-center pb-2 pt-2 ${
                            !currentNavVisible ? "border-r-2 border-red-500" : "border-r-2 border-transparent"
                        } ${itemVisibility.includes(false) ? "" : "hidden"}`}
                    >
                        <span className="mt-[2px]">{!currentNavVisible ? currentNavItem?.name : "More"}</span>
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
