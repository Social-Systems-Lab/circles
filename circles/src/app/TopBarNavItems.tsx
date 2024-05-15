"use client";

import Link from "next/link";
import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HiChevronDown } from "react-icons/hi";

const navItems = [
    { id: "home", title: "Home", path: "/", width: 61 },
    // { id: "dashboard", title: "Dashboard", path: "/dashboard", width: 97 },
    { id: "feeds", title: "Feeds", path: "/feeds", width: 61 },
    { id: "calendar", title: "Calendar", path: "/calendar", width: 83 },
    // { id: "projects", title: "Projects", path: "/dashboard", width: 79 },
    // { id: "circles", title: "Circles", path: "/circles", width: 60 },
    { id: "members", title: "Members", path: "/members", width: 110 },
    { id: "messenger", title: "Messenger", path: "/messenger", width: 100 },
    { id: "settings", title: "Settings", path: "/settings", width: 79 },
    { id: "admin", title: "Admin", path: "/admin", width: 79 },
    // { id: "notes", title: "Notes", path: "/dashboard", width: 61 },
    // { id: "collections", title: "Collections", path: "/dashboard", width: 99 },
];

export default function TopBarNavItems() {
    const itemContainerRef = useRef<HTMLDivElement | null>(null);
    const itemRefs = useRef<React.RefObject<HTMLDivElement>[]>(navItems.map(() => React.createRef()));
    const pathname = usePathname();
    const [itemVisibility, setItemVisibility] = useState<boolean[]>([]);
    const [navMenuOpen, setNavMenuOpen] = useState(false);
    const currentNavItem = navItems.find((x) => x.path === pathname);

    const recalculateItemVisibility = () => {
        if (!itemContainerRef.current) return;

        let newItemVisibility: boolean[] = [];

        // calculate visible and hidden items
        const containerWidth = itemContainerRef.current?.offsetWidth || 0;
        let currentWidth = 0;
        navItems.forEach((item, index) => {
            const itemWidth = item.width;
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
        <nav ref={itemContainerRef} className="flex-1 flex flex-row h-[60px] overflow-hidden mr-8">
            {navItems.map((item, index) => (
                <Link key={item.id} href={item.path}>
                    <div
                        ref={itemRefs.current[index]}
                        className={`flex-shrink-0 h-full items-center pr-2 pl-2 cursor-pointer flex flex-row justify-center ${
                            pathname === item.path ? "border-b-2 border-red-500" : "border-b-2 border-transparent"
                        } ${!itemVisibility[index] ? "hidden" : ""}`}
                    >
                        <div>
                            <p className="m-0 mt-[1px]">{item.title}</p>
                        </div>
                    </div>
                </Link>
            ))}

            <Popover open={navMenuOpen} onOpenChange={setNavMenuOpen}>
                <PopoverTrigger>
                    <div
                        className={`flex flex-row justify-center flex-shrink-0 h-full items-center pr-2 pl-2 cursor-pointer ${
                            !itemVisibility[navItems.findIndex((x) => x.path === pathname)] ? "border-b-2 border-red-500" : "border-b-2 border-transparent"
                        } ${itemVisibility.includes(false) ? "" : "hidden"}`}
                    >
                        <span className="mr-[2px]">{!itemVisibility[navItems.findIndex((x) => x.path === pathname)] ? currentNavItem?.title : "More"}</span>
                        <HiChevronDown size="16px" />
                    </div>

                    <div className={`p-2 cursor-pointer ${itemVisibility.includes(false) ? "" : "hidden"}`}>More</div>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 ml-4 overflow-hidden">
                    {navItems
                        .filter((_, index) => !itemVisibility[index])
                        .map((item) => (
                            <Link key={item.id} href={item.path}>
                                <div className="p-2 cursor-pointer hover:bg-[#f0f0f0]" onClick={() => setNavMenuOpen(false)}>
                                    {item.title}
                                </div>
                            </Link>
                        ))}
                </PopoverContent>
            </Popover>
        </nav>
    );
}
