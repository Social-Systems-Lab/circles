"use client";

import Link from "next/link";
import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import PageIcon from "../modules/page-icon";
import { motion } from "framer-motion";
import { userSettingsAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { IoChatbubbleOutline } from "react-icons/io5";
import { LiaGlobeAfricaSolid } from "react-icons/lia";
import { FaRegCircle } from "react-icons/fa6";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { CgFeed } from "react-icons/cg";
import { MdRssFeed } from "react-icons/md";
import { AiOutlineHome } from "react-icons/ai";
import GlobalCreateButton from "./global-create-button";

export default function GlobalNavItems() {
    const pathname = usePathname();
    const [settings, setSettings] = useAtom(userSettingsAtom);

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.GlobalNavItems.1");
        }
    }, []);

    return (
        <>
            <motion.nav
                className={`flex h-[72px] w-full flex-1 flex-row items-center justify-around overflow-hidden md:h-auto md:w-[72px] md:flex-col md:justify-normal`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
            >
                <Link href={"/explore"}>
                    <motion.div
                        className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg md:w-[64px] md:pb-2 md:pt-2 md:hover:bg-[#f8f8f8] ${
                            pathname === "/explore" ? "text-[#495cff]" : "text-[#696969]"
                        }`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0 * 0.1 }}
                    >
                        <LiaGlobeAfricaSolid size={"24px"} />
                        <motion.span
                            className="mt-[4px] text-[11px]"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3, delay: 0.2 + 0 * 0.1 }}
                        >
                            Explore
                        </motion.span>
                    </motion.div>
                </Link>
                <Link href={"/foryou"}>
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
                            For You
                        </motion.span>
                    </motion.div>
                </Link>

                <Link href={`/circles?tab=${settings?.circlesTab ?? "following"}`}>
                    <motion.div
                        className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg md:w-[64px] md:pb-2 md:pt-2 md:hover:bg-[#f8f8f8] ${
                            pathname === "/circles" ? "text-[#495cff]" : "text-[#696969]"
                        }`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 2 * 0.1 }}
                    >
                        <FaRegCircle size={"24px"} />
                        <motion.span
                            className="mt-[4px] text-[10px]"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3, delay: 0.2 + 2 * 0.1 }}
                        >
                            Communities
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

                <GlobalCreateButton />

                {/* <Link href={"/map"}>
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
                </Link> */}
                {/* 
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
                </Link> */}
            </motion.nav>
        </>
    );
}
