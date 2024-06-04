import { Circle, Page } from "@/models/models";
import { redirect } from "next/navigation";
import SettingsModule from "./settings/settings";

export type DynamicPageProps = {
    circle: Circle;
    page: Page;
    isDefaultCircle: boolean;
};

export default async function DynamicPage({ circle, page, isDefaultCircle }: DynamicPageProps) {
    switch (page.module) {
        case "settings":
            return <SettingsModule circle={circle} page={page} isDefaultCircle={isDefaultCircle} />;
        default:
            // redirect home
            redirect(isDefaultCircle ? "/" : `/${circle.handle}`);
    }
}
