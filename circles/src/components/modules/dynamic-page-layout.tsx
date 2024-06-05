import { Circle, Page } from "@/models/models";
import { redirect } from "next/navigation";
import SettingsModuleLayout from "./settings/settings-layout";
import { getCircleByHandle, getDefaultCircle } from "@/lib/data/circle";

export type DynamicLayoutPageProps = {
    circleHandle?: string;
    pageHandle?: string;
    isDefaultCircle: boolean;
    children: React.ReactNode;
};

export type ModuleLayoutPageProps = {
    circle: Circle;
    page: Page;
    isDefaultCircle: boolean;
    children: React.ReactNode;
};

export default async function DynamicPageLayout({
    children,
    circleHandle,
    pageHandle,
    isDefaultCircle,
}: DynamicLayoutPageProps) {
    let circle: Circle = {};
    if (isDefaultCircle) {
        circle = await getDefaultCircle(true);
    } else if (circleHandle) {
        circle = await getCircleByHandle(circleHandle);
    }

    let page = circle?.pages?.find((p) => p.handle === pageHandle);
    if (!page) {
        // redirect to not-found
        redirect(`/not-found`);
    }

    switch (page.module) {
        case "settings":
            return (
                <SettingsModuleLayout circle={circle} page={page} isDefaultCircle={isDefaultCircle}>
                    {children}
                </SettingsModuleLayout>
            );
        default:
            // redirect home
            redirect(isDefaultCircle ? "/" : `/${circle.handle}`);
    }
}
