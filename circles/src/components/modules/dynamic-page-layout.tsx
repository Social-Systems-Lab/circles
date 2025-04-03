import { Circle, Page } from "@/models/models";
import { redirect } from "next/navigation";
import { getCircleByHandle, getDefaultCircle } from "@/lib/data/circle";
import { modules } from "./modules";
import { getUserByHandle } from "@/lib/data/user";

export type DynamicLayoutPageProps = {
    circleHandle?: string;
    moduleHandle?: string;
    isDefaultCircle: boolean;
    children: React.ReactNode;
};

export type ModuleLayoutPageProps = {
    circle: Circle;
    moduleHandle: string;
    isDefaultCircle: boolean;
    children: React.ReactNode;
};

export const DynamicPageLayout = async ({
    children,
    circleHandle,
    moduleHandle,
    isDefaultCircle,
}: DynamicLayoutPageProps) => {
    let circle: Circle = {};
    if (isDefaultCircle) {
        circle = await getDefaultCircle();
    } else if (circleHandle) {
        circle = await getCircleByHandle(circleHandle);
    }

    // Check if the module is enabled for this circle
    const enabledModules = circle.enabledModules || [];
    const isModuleEnabled = enabledModules.includes(moduleHandle || "");

    // For backward compatibility, also check pages
    const isEnabledInPages = circle.pages?.some((p) => p.module === moduleHandle && p.enabled !== false);

    if (!isModuleEnabled && !isEnabledInPages) {
        // Redirect to not-found if module is not enabled
        redirect(`/not-found`);
    }

    let _module = modules[moduleHandle || ""];
    if (!_module) {
        // Redirect to not-found if module doesn't exist
        redirect(`/not-found`);
    }

    if (!_module.layoutComponent) {
        return <>{children}</>;
    }

    // Create a synthetic page object for backward compatibility
    const page: Page = {
        name: _module.name,
        handle: _module.handle,
        description: _module.description,
        module: _module.handle,
    };

    return (
        <_module.layoutComponent circle={circle} page={page} isDefaultCircle={isDefaultCircle}>
            {children}
        </_module.layoutComponent>
    );
};

export default DynamicPageLayout;
