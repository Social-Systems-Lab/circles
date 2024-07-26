"use client";

import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle } from "@/models/models";
import { FormNav } from "@/components/forms/form-nav";

const settingsForms = [
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
                <FormNav items={settingsForms} circle={circle} isDefaultCircle={isDefaultCircle} />
            </div>
            {children}
        </div>
    );
};
