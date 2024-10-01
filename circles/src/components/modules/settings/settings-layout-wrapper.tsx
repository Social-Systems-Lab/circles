"use client";

import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle, UserAndCircleInfo } from "@/models/models";
import { FormNav, NavItem } from "@/components/forms/form-nav";
import { getUserOrCircleInfo } from "@/lib/utils/form";

type SettingsForm = {
    name: string | UserAndCircleInfo;
    handle: string;
};

const settingsForms: SettingsForm[] = [
    {
        name: "About",
        handle: "",
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
        name: "Membership Requests",
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
        name: "Server",
        handle: "server-settings",
    },
];

export type SettingsLayoutWrapperProps = {
    circle: Circle;
    children: React.ReactNode;
    isDefaultCircle: boolean;
};

export const SettingsLayoutWrapper = ({ children, circle, isDefaultCircle }: SettingsLayoutWrapperProps) => {
    const isCompact = useIsCompact();
    const isUser = circle.circleType === "user";
    const navItems = settingsForms.map((item) => ({
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
                <FormNav items={navItems} circle={circle} isDefaultCircle={isDefaultCircle} />
            </div>
            {children}
        </div>
    );
};
