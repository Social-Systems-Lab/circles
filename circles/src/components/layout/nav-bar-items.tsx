// nav-bar-items.tsx

"use client";

import Link from "next/link";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { HiChevronDown, HiX } from "react-icons/hi";
import { Circle, Page } from "@/models/models";
import PageIcon from "../modules/page-icon";
import { useIsMobile } from "../utils/use-is-mobile";
import { motion, AnimatePresence } from "framer-motion";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

function NavItem({
    item,
    currentNavItem,
    getPath,
    index,
}: {
    item: Page;
    currentNavItem: Page | undefined;
    getPath: (page: Page) => string;
    index: number;
}) {
    return (
        <Link href={getPath(item)}>
            <motion.div
                className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg md:w-[64px] md:pb-2 md:pt-2 md:hover:bg-[#f8f8f8] ${
                    item === currentNavItem ? "text-[#495cff]" : "text-[#696969]"
                }`}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
            >
                <PageIcon module={item.module} size="24px" />
                <motion.span
                    className="mt-[4px] text-[11px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.2 + index * 0.1 }}
                >
                    {item.name}
                </motion.span>
            </motion.div>
        </Link>
    );
}

export default function NavBarItems({ circle, isDefaultCircle }: { circle: Circle; isDefaultCircle: boolean }) {
    const pathname = usePathname();
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    const isMobile = useIsMobile();
    const [user] = useAtom(userAtom);
    const isUser = circle?.circleType === "user";

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.NavBarItems.1");
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

    const userGroups = useMemo(() => {
        const membership = user?.memberships.find((m) => m.circleId === circle._id);
        return membership ? membership.userGroups : [];
    }, [user, circle]);

    const hasAccess = useCallback(
        (page: Page) => {
            const allowedUserGroups = circle?.accessRules?.[`__page_${page.handle}`] || [];

            // allow access if everyone has access or if user belongs to an allowed group
            return (
                allowedUserGroups.includes("everyone") || userGroups.some((group) => allowedUserGroups.includes(group))
            );
        },
        [circle, userGroups],
    );

    const authorizedPages = useMemo(() => circle?.pages?.filter(hasAccess) ?? [], [circle?.pages, hasAccess]);
    const visiblePages = useMemo(
        () => (isMobile ? authorizedPages?.slice(0, 3) : authorizedPages) ?? [],
        [authorizedPages, isMobile],
    );
    const morePages = useMemo(() => (isMobile ? authorizedPages.slice(3) : []) ?? [], [authorizedPages, isMobile]);

    return (
        <>
            <motion.nav
                className={`flex h-[72px] w-full flex-1 flex-row items-center justify-around overflow-hidden md:h-auto md:w-[72px] md:flex-col md:justify-normal`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
            >
                {visiblePages.map((item, index) => (
                    <NavItem
                        key={item.handle}
                        item={item}
                        currentNavItem={currentNavItem}
                        getPath={getPath}
                        index={index}
                    />
                ))}

                {morePages.length > 0 && (
                    <motion.div
                        className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center pb-2 pt-2 ${
                            morePages.includes(currentNavItem as Page) ? "text-[#495cff]" : "text-[#696969]"
                        }`}
                        onClick={() => setIsMoreMenuOpen(true)}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        <PageIcon
                            module={morePages.includes(currentNavItem as Page) ? currentNavItem?.module ?? "" : "pages"}
                            size="24px"
                        />
                        <motion.div
                            className="mt-[4px] flex flex-row items-center"
                            animate={{ y: [0, 2, 0] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                        >
                            <span className="text-[11px]">
                                {morePages.includes(currentNavItem as Page) ? currentNavItem?.name : "More"}
                            </span>
                            <HiChevronDown size="16px" />
                        </motion.div>
                    </motion.div>
                )}
            </motion.nav>

            <AnimatePresence>
                {isMoreMenuOpen && (
                    <motion.div
                        className="fixed inset-0 z-40 bg-white"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <div className="flex h-full flex-col">
                            <div className="flex items-center justify-between p-4">
                                <motion.button
                                    onClick={() => setIsMoreMenuOpen(false)}
                                    className="text-2xl"
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <HiX />
                                </motion.button>
                            </div>
                            <motion.div
                                className="grid grid-cols-3 gap-4 overflow-y-auto p-4"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                            >
                                {circle?.pages?.map((item, index) => (
                                    <Link
                                        key={item.handle}
                                        href={getPath(item)}
                                        onClick={() => setIsMoreMenuOpen(false)}
                                    >
                                        <motion.div
                                            className="flex flex-col items-center justify-center rounded-lg border p-4 hover:bg-gray-100"
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.3, delay: index * 0.05 }}
                                        >
                                            <PageIcon module={item.module} size="40px" />
                                            <span className="mt-2 text-center text-sm">{item.name}</span>
                                        </motion.div>
                                    </Link>
                                ))}
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
