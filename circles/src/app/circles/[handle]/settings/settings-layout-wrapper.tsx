"use client";

import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle, UserAndCircleInfo } from "@/models/models";
import { FormNav, NavItem } from "@/components/forms/form-nav";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { getUserOrCircleInfo } from "@/lib/utils/form";

type SettingsForm = {
    name: string | UserAndCircleInfo;
    handle: string;
};

const settingsForms: SettingsForm[] = [
    {
        name: "About",
        handle: "about",
    },
    {
        name: "Presence",
        handle: "presence",
    },
    {
        name: "Pages",
        handle: "pages",
    },
    {
        name: "User Groups",
        handle: "user-groups",
    },
    {
        name: "Access Rules",
        handle: "access-rules",
    },
    {
        name: "Follow Requests",
        handle: "membership-requests",
    },
    {
        name: "Questionnaire",
        handle: "questionnaire",
    },
    {
        name: { user: "Causes and Skills", circle: "Causes and Skills Needed" },
        handle: "matchmaking",
    },
    {
        name: "General",
        handle: "general",
    },
    {
        name: "Server",
        handle: "server-settings",
    },
    {
        name: "Subscription",
        handle: "subscription",
    },
];

export type SettingsLayoutWrapperProps = {
    circle: Circle;
    children: React.ReactNode;
};

export const SettingsLayoutWrapper = ({ children, circle }: SettingsLayoutWrapperProps) => {
    const isCompact = useIsCompact();
    const isUser = circle.circleType === "user";
    const [user] = useAtom(userAtom);
    const navItems = settingsForms
        .filter((item) => {
            if (item.handle === "subscription") {
                return user?.handle === circle.handle;
            }
            return true;
        })
        .map((item) => ({
            name: getUserOrCircleInfo(item.name, isUser),
            handle: item.handle,
        })) as NavItem[];

    return (
        <div
            className="flex w-full"
            style={{
                flexDirection: isCompact ? "column" : "row",
                paddingTop: isCompact ? "0" : "20px",
            }}
        >
            <div
                className="relative flex flex-col items-center pb-2"
                style={{
                    flex: isCompact ? "0" : "1",
                    alignItems: isCompact ? "normal" : "flex-end",
                    minWidth: isCompact ? "0px" : "240px",
                }}
            >
                <FormNav items={navItems} circle={circle} />
            </div>
            {children}
        </div>
    );
};
