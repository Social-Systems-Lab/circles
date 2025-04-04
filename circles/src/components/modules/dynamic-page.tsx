import { Circle, Page } from "@/models/models";
import { redirect } from "next/navigation";
import { getCircleByHandle, getDefaultCircle } from "@/lib/data/circle";
import { modules } from "./modules";
import { getUserByHandle } from "@/lib/data/user";

export type DynamicPageProps = {
    circleHandle?: string;
    moduleHandle?: string;
    subpage?: string;
    searchParams?: { [key: string]: string | string[] | undefined };
};

export type ModulePageProps = {
    circle: Circle;
    moduleHandle: string;
    page?: Page;
    subpage?: string;
    searchParams?: { [key: string]: string | string[] | undefined };
};

export default async function DynamicPage({ circleHandle, moduleHandle, subpage, searchParams }: DynamicPageProps) {
    let circle: Circle = {};
    if (circleHandle) {
        circle = await getCircleByHandle(circleHandle);
    }

    // Check if the module is enabled for this circle
    const enabledModules = circle.enabledModules || [];
    const isModuleEnabled = enabledModules.includes(moduleHandle || "");

    if (!isModuleEnabled) {
        // Redirect to not-found if module is not enabled
        redirect(`/not-found`);
    }

    let _module = modules[moduleHandle || ""];
    if (!_module) {
        // Redirect to not-found if module doesn't exist
        redirect(`/not-found`);
    }

    // Create a synthetic page object for backward compatibility
    const page: Page = {
        name: _module.name,
        handle: _module.handle,
        description: _module.description,
        module: _module.handle,
    };

    return (
        <_module.component
            circle={circle}
            page={page}
            moduleHandle={moduleHandle || ""}
            subpage={subpage}
            searchParams={searchParams}
        />
    );
}
