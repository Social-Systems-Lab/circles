"use client";

import Link from "next/link";
import React, { useState, useMemo, useCallback } from "react";
import { usePathname } from "next/navigation";
import { HiChevronDown, HiX } from "react-icons/hi";
import { Circle, Page } from "@/models/models";
import PageIcon from "../modules/page-icon";
import { useIsMobile } from "../utils/use-is-mobile";
import { motion, AnimatePresence } from "framer-motion";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { AiOutlineHome, AiOutlineSetting } from "react-icons/ai";
import { IoChatbubbleOutline } from "react-icons/io5";
import { MdOutlineExplore } from "react-icons/md";
import { LiaGlobeAfricaSolid } from "react-icons/lia";

function GlobalNavItem({
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

export default function GlobalNavItems() {
    const pathname = usePathname();
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    const isMobile = useIsMobile();
    const [user] = useAtom(userAtom);

    return (
        <>
            <motion.nav
                className={`flex h-[72px] w-full flex-1 flex-row items-center justify-around overflow-hidden md:h-auto md:w-[72px] md:flex-col md:justify-normal`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
            >
                <Link href={"/"}>
                    <motion.div
                        className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg md:w-[64px] md:pb-2 md:pt-2 md:hover:bg-[#f8f8f8] ${
                            pathname === "/" ? "text-[#495cff]" : "text-[#696969]"
                        }`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0 * 0.1 }}
                    >
                        <AiOutlineHome size={"24px"} />
                        <motion.span
                            className="mt-[4px] text-[11px]"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3, delay: 0.2 + 0 * 0.1 }}
                        >
                            Home
                        </motion.span>
                    </motion.div>
                </Link>

                <Link href={"/explore"}>
                    <motion.div
                        className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg md:w-[64px] md:pb-2 md:pt-2 md:hover:bg-[#f8f8f8] ${
                            pathname === "/explore" ? "text-[#495cff]" : "text-[#696969]"
                        }`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 1 * 0.1 }}
                    >
                        <MdOutlineExplore size={"24px"} />
                        <motion.span
                            className="mt-[4px] text-[11px]"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3, delay: 0.2 + 1 * 0.1 }}
                        >
                            Explore
                        </motion.span>
                    </motion.div>
                </Link>

                <Link href={"/chat"}>
                    <motion.div
                        className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg md:w-[64px] md:pb-2 md:pt-2 md:hover:bg-[#f8f8f8] ${
                            pathname === "/chat" ? "text-[#495cff]" : "text-[#696969]"
                        }`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 2 * 0.1 }}
                    >
                        <IoChatbubbleOutline size={"24px"} />
                        <motion.span
                            className="mt-[4px] text-[11px]"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3, delay: 0.2 + 2 * 0.1 }}
                        >
                            Chat
                        </motion.span>
                    </motion.div>
                </Link>

                <Link href={"/map"}>
                    <motion.div
                        className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg md:w-[64px] md:pb-2 md:pt-2 md:hover:bg-[#f8f8f8] ${
                            pathname === "/map" ? "text-[#495cff]" : "text-[#696969]"
                        }`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 3 * 0.1 }}
                    >
                        <LiaGlobeAfricaSolid size={"24px"} />
                        <motion.span
                            className="mt-[4px] text-[11px]"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3, delay: 0.2 + 3 * 0.1 }}
                        >
                            Map
                        </motion.span>
                    </motion.div>
                </Link>

                <Link href={"/settings"}>
                    <motion.div
                        className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg md:w-[64px] md:pb-2 md:pt-2 md:hover:bg-[#f8f8f8] ${
                            pathname === "/settings" ? "text-[#495cff]" : "text-[#696969]"
                        }`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 4 * 0.1 }}
                    >
                        <AiOutlineSetting size={"24px"} />
                        <motion.span
                            className="mt-[4px] text-[11px]"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3, delay: 0.2 + 4 * 0.1 }}
                        >
                            Settings
                        </motion.span>
                    </motion.div>
                </Link>
            </motion.nav>
        </>
    );
}
