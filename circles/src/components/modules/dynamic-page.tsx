import { Circle, Page } from "@/models/models";
import { redirect } from "next/navigation";
import SettingsModule from "./settings/settings";

export type DynamicPageProps = {
    circle: Circle;
    page: Page;
    subpage?: string;
    isDefaultCircle: boolean;
};

export default async function DynamicPage({ circle, page, subpage, isDefaultCircle }: DynamicPageProps) {
    switch (page.module) {
        case "settings":
            return <SettingsModule circle={circle} page={page} subpage={subpage} isDefaultCircle={isDefaultCircle} />;
        default:
            // redirect home
            redirect(isDefaultCircle ? "/" : `/${circle.handle}`);
    }
}
