import { Circle, Page } from "@/models/models";
import { redirect } from "next/navigation";
import { getCircleByHandle, getDefaultCircle } from "@/lib/data/circle";
import { modules } from "./modules";

export type DynamicPageProps = {
    circleHandle?: string;
    pageHandle?: string;
    subpage?: string;
    isDefaultCircle: boolean;
};

export type ModulePageProps = {
    circle: Circle;
    page: Page;
    isDefaultCircle: boolean;
    subpage?: string;
};

export default async function DynamicPage({ circleHandle, pageHandle, subpage, isDefaultCircle }: DynamicPageProps) {
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

    let _module = modules[page.module];
    if (!_module) {
        // redirect to not-found
        redirect(`/not-found`);
    }

    return <_module.component circle={circle} page={page} subpage={subpage} isDefaultCircle={isDefaultCircle} />;
}
