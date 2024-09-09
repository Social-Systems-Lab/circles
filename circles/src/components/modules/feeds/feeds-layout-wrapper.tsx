"use client";

import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle, Feed } from "@/models/models";
import { FormNav, NavItem } from "@/components/forms/form-nav";
import { FeedsNav } from "./feeds-nav";

export type FeedsLayoutWrapperProps = {
    circle: Circle;
    children: React.ReactNode;
    isDefaultCircle: boolean;
    feeds: Feed[];
};

export const FeedsLayoutWrapper = ({ children, circle, feeds, isDefaultCircle }: FeedsLayoutWrapperProps) => {
    const isCompact = useIsCompact();
    const navItems = feeds.map((item) => ({
        name: item.name,
        handle: item.handle,
    })) as NavItem[];

    return (
        <div
            className="flex w-full bg-[#fbfbfb]"
            style={{
                flexDirection: isCompact ? "column" : "row",
            }}
        >
            <div
                className="relative flex flex-col items-center"
                style={{
                    flex: isCompact ? "0" : "1",
                    alignItems: isCompact ? "normal" : "flex-end",
                    minWidth: isCompact ? "0px" : "240px",
                    paddingTop: isCompact ? "0" : "20px",
                }}
            >
                <FeedsNav items={navItems} circle={circle} isDefaultCircle={isDefaultCircle} />
            </div>
            {children}
        </div>
    );
};
