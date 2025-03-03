"use client";

import Image from "next/image";
import Link from "next/link";
import GlobalNavItems from "./global-nav-items";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { useEffect } from "react";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

export default function GlobalNav() {
    // hide nav if not logged in
    const [user, setUser] = useAtom(userAtom);
    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.GlobalNav.1");
        }
    }, []);

    if (!user) {
        return null;
    }

    return (
        <>
            <div className={`order-last h-[72px] w-full flex-shrink-0 md:order-first md:h-full md:w-[72px]`}></div>
            <div className={`fixed bottom-0 z-[100] h-[72px] w-full bg-white shadow-lg md:top-0 md:h-full md:w-[72px]`}>
                <div className={`flex h-[72px] flex-row items-center justify-center md:h-auto md:w-[72px] md:flex-col`}>
                    <Link href="/">
                        <div className="ml-4 mr-4 flex flex-shrink-0 flex-col items-center justify-center md:mb-4 md:ml-0 md:mr-0 md:mt-4 ">
                            <div className="h-[40px] w-[40px] cursor-pointer">
                                <Image
                                    src={"/images/default-picture.png"}
                                    alt="Logo"
                                    className="h-[40px] w-[40px] overflow-hidden rounded-full object-cover shadow"
                                    width={100}
                                    height={100}
                                />
                            </div>
                        </div>
                    </Link>

                    <GlobalNavItems />
                </div>
            </div>
        </>
    );
}
