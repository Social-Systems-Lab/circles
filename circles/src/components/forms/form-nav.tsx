"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "../ui/button";
import { Circle } from "@/models/models";

type NavItem = {
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

    const getPath = (item: NavItem) => {
        if (isDefaultCircle) {
            return `/settings${item.handle ? `/${item.handle}` : ""}`;
        } else {
            return `/circles/${circle.handle}/settings${item.handle ? `/${item.handle}` : ""}`;
        }
    };

    return (
        <nav className={cn("fixed flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1", className)} {...props}>
            {items.map((item) => (
                <Link
                    key={item.handle}
                    href={getPath(item)}
                    className={cn(
                        buttonVariants({ variant: "ghost" }),
                        pathname === getPath(item) ? "bg-muted hover:bg-muted" : "hover:bg-transparent hover:underline",
                        "justify-start",
                        "lg:min-w-[200px]",
                    )}
                >
                    {item.name}
                </Link>
            ))}
        </nav>
    );
};
