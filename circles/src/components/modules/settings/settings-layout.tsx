"use server";

import { FormNav } from "@/components/forms/form-nav";
import { ModuleLayoutPageProps } from "../dynamic-page-layout";

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

export default async function SettingsModuleLayout({ children, circle, page, isDefaultCircle }: ModuleLayoutPageProps) {
    return (
        <div className="flex w-full flex-col lg:flex-row lg:pt-[20px]">
            <div className="relative flex flex-col items-center pb-2 lg:flex-1 lg:items-end">
                <FormNav items={settingsForms} circle={circle} isDefaultCircle={isDefaultCircle} />
            </div>
            {children}
        </div>
    );
}
