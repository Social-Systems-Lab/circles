"use client";

import Link from "next/link";
import React, { useState, useMemo, useCallback } from "react";
import { usePathname } from "next/navigation";
import { HiChevronDown, HiX } from "react-icons/hi";
import { Circle, Page } from "@/models/models";
import PageIcon from "../modules/page-icon";
import { useIsMobile } from "../utils/use-is-mobile";

export default function NavBarItems({ circle, isDefaultCircle }: { circle: Circle; isDefaultCircle: boolean }) {
    const pathname = usePathname();
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    const isMobile = useIsMobile();

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

    const visiblePages = useMemo(
        () => (isMobile ? circle?.pages?.slice(1, 4) : circle?.pages) ?? [],
        [circle?.pages, isMobile],
    );
    const morePages = useMemo(() => (isMobile ? circle?.pages?.slice(4) : []) ?? [], [circle?.pages, isMobile]);

    return (
        <>
            <nav
                className={`flex h-[72px] w-full flex-1 flex-row items-center justify-around overflow-hidden md:h-auto md:w-[72px] md:flex-col md:justify-normal`}
            >
                {visiblePages.map((item) => (
                    <NavItem key={item.handle} item={item} currentNavItem={currentNavItem} getPath={getPath} />
                ))}

                {morePages.length > 0 && (
                    <div
                        className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center pb-2 pt-2 ${
                            morePages.includes(currentNavItem as Page) ? "text-[#495cff]" : "text-[#696969]"
                        }`}
                        onClick={() => setIsMoreMenuOpen(true)}
                    >
                        <PageIcon
                            module={morePages.includes(currentNavItem as Page) ? currentNavItem?.module ?? "" : "pages"}
                            size="24px"
                        />
                        <div className="mt-[4px] flex flex-row items-center">
                            <span className="text-[11px]">
                                {morePages.includes(currentNavItem as Page) ? currentNavItem?.name : "More"}
                            </span>
                            <HiChevronDown size="16px" />
                        </div>
                    </div>
                )}
            </nav>

            {isMoreMenuOpen && (
                <div className="fixed inset-0 z-40 bg-white">
                    <div className="flex h-full flex-col">
                        <div className="flex items-center justify-between p-4">
                            {/* <h2 className="text-xl font-bold">More Apps</h2> */}
                            <button onClick={() => setIsMoreMenuOpen(false)} className="text-2xl">
                                <HiX />
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-4 overflow-y-auto p-4">
                            {circle?.pages?.map((item) => (
                                <Link key={item.handle} href={getPath(item)} onClick={() => setIsMoreMenuOpen(false)}>
                                    <div className="flex flex-col items-center justify-center rounded-lg border p-4 hover:bg-gray-100">
                                        <PageIcon module={item.module} size="40px" />
                                        <span className="mt-2 text-center text-sm">{item.name}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function NavItem({
    item,
    currentNavItem,
    getPath,
}: {
    item: Page;
    currentNavItem: Page | undefined;
    getPath: (page: Page) => string;
}) {
    return (
        <Link href={getPath(item)}>
            <div
                className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center md:pb-2 md:pt-2 ${
                    item === currentNavItem ? "text-[#495cff]" : "text-[#696969]"
                }`}
            >
                <PageIcon module={item.module} size="24px" />
                <span className="mt-[4px] text-[11px]">{item.name}</span>
            </div>
        </Link>
    );
}

// export default function NavBarItems({ circle, isDefaultCircle }: { circle: Circle; isDefaultCircle: boolean }) {
//     const pathname = usePathname();
//     const [navMenuOpen, setNavMenuOpen] = useState(false);
//     const isMobile = useIsMobile();

//     const getPath = useCallback(
//         (page: Page) => {
//             if (isDefaultCircle) {
//                 return `/${page.handle}`;
//             } else {
//                 return `/circles/${circle.handle}${page.handle ? `/${page.handle}` : ""}`;
//             }
//         },
//         [isDefaultCircle, circle.handle],
//     );

//     const currentNavItem = useMemo(() => {
//         return circle?.pages?.find((x) => {
//             if (x.handle === "") {
//                 return pathname === getPath(x);
//             }
//             return pathname.startsWith(getPath(x));
//         });
//     }, [circle.pages, getPath, pathname]);

//     const visiblePages = useMemo(
//         () => (isMobile ? circle?.pages?.slice(1, 4) : circle?.pages) ?? [],
//         [circle?.pages, isMobile],
//     );
//     const morePages = useMemo(() => (isMobile ? circle?.pages?.slice(4) : []) ?? [], [circle?.pages, isMobile]);

//     return (
//         <nav
//             className={`flex h-[72px] w-full flex-1 flex-row items-center justify-around overflow-hidden md:h-auto md:w-[72px] md:flex-col md:justify-normal`}
//         >
//             {visiblePages.map((item) => (
//                 <Link key={item.handle} href={getPath(item)}>
//                     <div
//                         className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center pb-2 pt-2 ${
//                             item === currentNavItem ? "text-[#495cff]" : "text-[#696969]"
//                         }`}
//                     >
//                         <PageIcon module={item.module} size="24px" />
//                         <span className="mt-[4px] text-[11px]">{item.name}</span>
//                     </div>
//                 </Link>
//             ))}

//             {morePages.length > 0 && (
//                 <Popover open={navMenuOpen} onOpenChange={setNavMenuOpen}>
//                     <PopoverTrigger>
//                         <div
//                             className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-center pb-2 pt-2 ${
//                                 morePages.includes(currentNavItem as Page) ? "text-[#495cff]" : "text-[#696969]"
//                             }`}
//                         >
//                             <PageIcon
//                                 module={
//                                     morePages.includes(currentNavItem as Page) ? currentNavItem?.module ?? "" : "pages"
//                                 }
//                                 size="24px"
//                             />
//                             <div className="mt-[4px] flex flex-row items-center">
//                                 <span className="text-[11px]">
//                                     {morePages.includes(currentNavItem as Page) ? currentNavItem?.name : "More"}
//                                 </span>
//                                 <HiChevronDown size="16px" />
//                             </div>
//                         </div>
//                     </PopoverTrigger>
//                     <PopoverContent className="z-[400] w-auto overflow-hidden p-0 md:ml-4">
//                         {morePages.map((item) => (
//                             <Link key={item.handle} href={getPath(item)}>
//                                 <div
//                                     className="cursor-pointer p-2 hover:bg-[#f0f0f0]"
//                                     onClick={() => setNavMenuOpen(false)}
//                                 >
//                                     {item.name}
//                                 </div>
//                             </Link>
//                         ))}
//                     </PopoverContent>
//                 </Popover>
//             )}
//         </nav>
//     );
// }
