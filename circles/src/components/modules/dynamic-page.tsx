import { Circle } from "@/models/models";
import { redirect } from "next/navigation";
import { getCircleByHandle } from "@/lib/data/circle";
import { modules } from "./modules";

export type DynamicPageProps = {
    circleHandle?: string;
    moduleHandle?: string;
    searchParams?: { [key: string]: string | string[] | undefined };
};

export type ModulePageProps = {
    circle: Circle;
    moduleHandle: string;
    searchParams?: { [key: string]: string | string[] | undefined };
};

export default async function DynamicPage({ circleHandle, moduleHandle, searchParams }: DynamicPageProps) {
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

    return <_module.component circle={circle} moduleHandle={moduleHandle || ""} searchParams={searchParams} />;
}
