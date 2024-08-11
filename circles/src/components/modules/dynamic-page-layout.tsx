import { Circle, Page } from "@/models/models";
import { redirect } from "next/navigation";
import { getCircleByHandle, getDefaultCircle } from "@/lib/data/circle";
import { modules } from "./modules";
import { getUserByHandle } from "@/lib/data/user";

export type DynamicLayoutPageProps = {
    circleHandle?: string;
    pageHandle?: string;
    isDefaultCircle: boolean;
    children: React.ReactNode;
    isUser?: boolean;
};

export type ModuleLayoutPageProps = {
    circle: Circle;
    page: Page;
    isDefaultCircle: boolean;
    children: React.ReactNode;
    isUser?: boolean;
};

export const DynamicPageLayout = async ({
    children,
    circleHandle,
    pageHandle,
    isDefaultCircle,
    isUser = false,
}: DynamicLayoutPageProps) => {
    let circle: Circle = {};
    if (isDefaultCircle) {
        circle = await getDefaultCircle();
    } else if (circleHandle) {
        if (isUser) {
            circle = await getUserByHandle(circleHandle);
        } else {
            circle = await getCircleByHandle(circleHandle);
        }
    }

    let page = circle?.pages?.find((p) => p.handle === pageHandle);
    if (!page) {
        // redirect to not-found
        redirect(`/not-found`);
    }

    let _module = modules[page.module];
    if (!_module) {
        // redirect to not-found
        redirect(`/not-found`);
    }

    if (!_module.layoutComponent) {
        return <>{children}</>;
    }

    return (
        <_module.layoutComponent circle={circle} page={page} isDefaultCircle={isDefaultCircle} isUser={isUser}>
            {children}
        </_module.layoutComponent>
    );
};

export default DynamicPageLayout;
