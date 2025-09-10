"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import PageIcon from "../modules/page-icon";
import { motion } from "framer-motion";
import { userAtom, sidePanelModeAtom, drawerContentAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { IoChatbubbleOutline, IoPulseOutline } from "react-icons/io5";
import { LiaGlobeAfricaSolid } from "react-icons/lia";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { CgFeed } from "react-icons/cg";
import { MdRssFeed } from "react-icons/md";
import GlobalCreateButton from "./global-create-button";
import { Bookmark, Plus } from "lucide-react";
import { Circle } from "@/models/models";
import { CirclePicture } from "../modules/circles/circle-picture";
import PinPicker from "../modules/home/pin-picker";
import { RiMegaphoneLine } from "react-icons/ri";

export default function GlobalNavItems() {
    const pathname = usePathname();
    const router = useRouter();
    const [user, setUser] = useAtom(userAtom);
    const [panelMode, setSidePanelMode] = useAtom(sidePanelModeAtom);
    const [drawerContent, setDrawerContent] = useAtom(drawerContentAtom);
    const isMobile = useIsMobile();
    const [pinned, setPinned] = useState<Circle[]>([]);
    const [pinPickerOpen, setPinPickerOpen] = useState(false);

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.GlobalNavItems.1");
        }
    }, []);

    // Load pinned circles whenever the list of IDs changes on the user object
    useEffect(() => {
        if (!user) {
            setPinned([]);
            return;
        }
        (async () => {
            try {
                const res = await fetch("/api/pins", { cache: "no-store" });
                if (!res.ok) {
                    throw new Error("Failed to fetch");
                }
                const circles = (await res.json()) as Circle[];
                setPinned(circles);
            } catch (e) {
                if (logLevel >= LOG_LEVEL_TRACE) {
                    console.warn("Failed to fetch pinned circles", e);
                }
                setPinned([]);
            }
        })();
    }, [user?.pinnedCircles]);

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
                        onClick={() => {
                            setSidePanelMode("none");
                            setDrawerContent("explore");
                        }}
                        className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg md:w-[64px] md:pb-2 md:pt-2 md:hover:bg-[#f8f8f8] ${
                            pathname === "/explore" && panelMode !== "activity" && drawerContent !== "announcements"
                                ? "text-[#495cff]"
                                : "text-[#696969]"
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
                <div
                    onClick={() => {
                        if (isMobile) {
                            if (pathname !== "/explore") {
                                router.push("/explore");
                            }
                            setDrawerContent("announcements");
                        } else {
                            setSidePanelMode("activity");
                            router.push("/explore?panel=activity");
                        }
                    }}
                >
                    <motion.div
                        className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg md:w-[64px] md:pb-2 md:pt-2 md:hover:bg-[#f8f8f8] ${
                            (pathname === "/explore" && panelMode === "activity") ||
                            (isMobile && drawerContent === "announcements" && pathname === "/explore")
                                ? "text-[#495cff]"
                                : "text-[#696969]"
                        }`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0 * 0.1 }}
                    >
                        <RiMegaphoneLine size={"24px"} />
                        {/* <IoPulseOutline size={"24px"} /> */}
                        <motion.span
                            className="mt-[4px] text-[8px]"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3, delay: 0.2 + 0 * 0.1 }}
                        >
                            Announcements
                        </motion.span>
                    </motion.div>
                </div>

                {/* Mobile: Bookmarks nav item */}
                <Link href={"/bookmarks"}>
                    <motion.div
                        onClick={() => setSidePanelMode("none")}
                        className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg md:w-[64px] md:pb-2 md:pt-2 md:hover:bg-[#f8f8f8] ${
                            pathname === "/bookmarks" ? "text-[#495cff]" : "text-[#696969]"
                        }`}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                    >
                        <Bookmark size={"24px"} />
                        <motion.span
                            className="mt-[4px] text-[11px]"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3, delay: 0.3 }}
                        >
                            Bookmarks
                        </motion.span>
                    </motion.div>
                </Link>

                {user && (
                    <>
                        {/* <Link href={"/chat"}>
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
                        </Link> */}
                        <GlobalCreateButton />

                        {/* Divider between Create button and pinned tray */}
                        <div className="my-2 hidden w-[64px] md:flex">
                            <div className="mx-auto h-px w-10 bg-gray-200" />
                        </div>

                        {/* Desktop-only: Pinned tray (max 5), placeholders open PinPicker */}
                        <div className="mt-1 hidden w-[64px] flex-col items-center gap-2 md:flex">
                            {Array.from({ length: 5 }).map((_, i) => {
                                const c = pinned[i];
                                if (c) {
                                    return (
                                        <Link href={`/circles/${c.handle}`} key={c._id}>
                                            <CirclePicture circle={c} size="36px" openPreview={false} />
                                        </Link>
                                    );
                                }
                                return (
                                    <button
                                        key={`placeholder-${i}`}
                                        aria-label="Pin a community"
                                        title="Pin a community"
                                        onClick={() => setPinPickerOpen(true)}
                                        className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                );
                            })}
                        </div>

                        {/* Pin picker dialog */}
                        <PinPicker
                            open={pinPickerOpen}
                            onOpenChange={setPinPickerOpen}
                            onSelect={async (circle) => {
                                try {
                                    const res = await fetch("/api/pins", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ circleId: circle._id }),
                                    });
                                    if (res.ok) {
                                        const data = await res.json();
                                        if (data?.user) {
                                            setUser(data.user);
                                        }
                                        const r = await fetch("/api/pins", { cache: "no-store" });
                                        if (r.ok) {
                                            const arr = (await r.json()) as Circle[];
                                            setPinned(arr);
                                        }
                                    }
                                } catch {}
                            }}
                        />
                    </>
                )}

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
