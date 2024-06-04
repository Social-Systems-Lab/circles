import { Circle, Page } from "@/models/models";
import { redirect } from "next/navigation";
import SettingsModuleLayout from "./settings/settings-layout";

export type DynamicLayoutPageProps = {
    circle: Circle;
    page: Page;
    isDefaultCircle: boolean;
    children: React.ReactNode;
};

export default async function DynamicPageLayout({ children, circle, page, isDefaultCircle }: DynamicLayoutPageProps) {
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
