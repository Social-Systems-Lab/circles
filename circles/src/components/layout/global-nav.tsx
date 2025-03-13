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
                        <div className="group relative ml-4 mr-4 flex flex-shrink-0 flex-col items-center justify-center md:mb-4 md:ml-0 md:mr-0 md:mt-4">
                            <div className="relative">
                                {/* <div className="animate-pulse-slow absolute -inset-0 rounded-full bg-primary/30"></div> */}
                                {/* First ripple ring */}
                                <div className="animate-ripple absolute -inset-1 z-[-1] rounded-full border-8 border-primary/20"></div>
                                {/* Second ripple ring with delay */}
                                <div className="animate-ripple-delay absolute -inset-1 z-[-1] rounded-full border-8 border-primary/20"></div>
                                <div className="animate-ripple-delay-2 absolute -inset-1 z-[-1] rounded-full border-8 border-primary/20"></div>

                                <div className="relative h-[40px] w-[40px] transform cursor-pointer transition-all duration-300 hover:scale-110">
                                    <Image
                                        src={"/images/circles-picture.svg"}
                                        alt="Logo"
                                        className="h-[40px] w-[40px] overflow-hidden rounded-full bg-white object-cover shadow-md transition-shadow duration-300 hover:shadow-xl"
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
