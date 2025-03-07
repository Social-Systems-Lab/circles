import { Circle, Page } from "@/models/models";
import { redirect } from "next/navigation";
import { getCircleByHandle, getDefaultCircle } from "@/lib/data/circle";
import { modules } from "./modules";
import { getUserByHandle } from "@/lib/data/user";

export type DynamicPageProps = {
    circleHandle?: string;
    pageHandle?: string;
    subpage?: string;
    isDefaultCircle: boolean;
    searchParams?: { [key: string]: string | string[] | undefined };
};

export type ModulePageProps = {
    circle: Circle;
    page: Page;
    isDefaultCircle: boolean;
    subpage?: string;
    searchParams?: { [key: string]: string | string[] | undefined };
};

export default async function DynamicPage({
    circleHandle,
    pageHandle,
    subpage,
    isDefaultCircle,
    searchParams,
}: DynamicPageProps) {
    let circle: Circle = {};
    if (isDefaultCircle) {
        circle = await getDefaultCircle();
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

    return (
        <_module.component
            circle={circle}
            page={page}
            subpage={subpage}
            isDefaultCircle={isDefaultCircle}
            searchParams={searchParams}
        />
    );
}
