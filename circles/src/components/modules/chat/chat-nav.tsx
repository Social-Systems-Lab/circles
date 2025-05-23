"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Circle } from "@/models/models";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { buttonVariants } from "@/components/ui/button";
import { useEffect } from "react";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";

export type NavItem = {
    name: string;
    handle: string;
};

type ChatNavProps = {
    items: NavItem[];
    circle: Circle;
    className?: string;
};

export const ChatNav: React.FC<ChatNavProps> = ({ items, circle, className, ...props }) => {
    const pathname = usePathname();
    const filteredItems = items;
    const isCompact = useIsCompact();

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.ChatNav.1");
        }
    }, []);

    const getPath = (item: NavItem) => {
        return `/circles/${circle.handle}/chat${item.handle && item.handle !== "default" ? `/${item.handle}` : ""}`;
    };

    return (
        <>
            <nav
                className={cn("flex", className)}
                style={{
                    position: isCompact ? "relative" : "relative",
                    marginLeft: isCompact ? "10px" : "20px",
                    marginRight: isCompact ? "10px" : "20px",
                    flexDirection: isCompact ? "row" : "column",
                    gap: isCompact ? "4px" : "4px",
                    flexWrap: isCompact ? "wrap" : "nowrap",
                    marginTop: isCompact ? "10px" : "0px",
                }}
                {...props}
            >
                {filteredItems.map((item) => (
                    <Link
                        key={item.handle}
                        href={getPath(item)}
                        className={cn(
                            buttonVariants({ variant: "ghost" }),
                            pathname === getPath(item)
                                ? "bg-muted hover:bg-muted"
                                : "hover:bg-transparent hover:underline",
                            "justify-start",
                        )}
                        style={{
                            minWidth: isCompact ? "0px" : "200px",
                        }}
                    >
                        {item.name}
                    </Link>
                ))}
            </nav>
        </>
    );
};
