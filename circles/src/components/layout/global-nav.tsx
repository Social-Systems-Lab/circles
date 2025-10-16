"use client";

import Image from "next/image";
import Link from "next/link";
import GlobalNavItems from "./global-nav-items";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { useEffect } from "react";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

import { usePathname } from "next/navigation";

export default function GlobalNav() {
    const [user, setUser] = useAtom(userAtom);
    const pathname = usePathname();
    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.GlobalNav.1");
        }
    }, []);

    if (!user && pathname === "/welcome") {
        return null;
    }

    return (
        <>
            <div className={`order-last h-[72px] w-full flex-shrink-0 md:order-first md:h-full md:w-[72px]`}></div>
            <div className={`fixed bottom-0 z-[300] h-[72px] w-full bg-white shadow-md md:top-0 md:h-full md:w-[72px]`}>
                <div className={`flex h-[72px] flex-row items-center justify-center md:h-auto md:w-[72px] md:flex-col`}>
                    <Link href="/circles/kamooni">
                        <div className="group relative ml-4 mr-4 hidden flex-shrink-0 flex-col items-center justify-center md:mb-4 md:ml-0 md:mr-0 md:mt-4 md:flex">
                            <div className="relative">
                                <div className="relative h-[50px] w-[50px] transform cursor-pointer">
                                    <Image
                                        src={"/images/logo-test3.jpg"}
                                        alt="Logo"
                                        className="h-[50px] w-[50px] overflow-hidden rounded-full bg-white object-cover"
                                        width={100}
                                        height={100}
                                    />
                                </div>
                            </div>
                        </div>
                    </Link>

                    <GlobalNavItems />
                </div>
            </div>
        </>
    );
}
