"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "../ui/button";
import { Circle } from "@/models/models";
import { useIsCompact } from "../utils/use-is-compact";

export type NavItem = {
    name: string;
    handle: string;
};

type FormNavProps = {
    items: NavItem[];
    circle: Circle;
    isDefaultCircle: boolean;
    className?: string;
};

export const FormNav: React.FC<FormNavProps> = ({ items, circle, isDefaultCircle, className, ...props }) => {
    const pathname = usePathname();
    const filteredItems = isDefaultCircle ? items : items.filter((item) => item.handle !== "server-settings");
    const isCompact = useIsCompact();

    const getPath = (item: NavItem) => {
        if (isDefaultCircle) {
            return `/settings${item.handle ? `/${item.handle}` : ""}`;
        } else {
            return `/${circle.circleType === "user" ? "users" : "circles"}/${circle.handle}/settings${item.handle ? `/${item.handle}` : ""}`;
        }
    };

    return (
        <>
            <nav
                className={cn("flex", className)}
                style={{
                    position: isCompact ? "relative" : "fixed",
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
            {isCompact && <hr className="mb-2 mt-2" />}
        </>
    );
};
