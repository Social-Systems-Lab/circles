"use server";

import { ModulePageProps } from "../dynamic-page";
import { getCircles } from "@/lib/data/circle";
import CirclesList from "./circles-list";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";

export default async function CirclesModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    // get all circles
    let circles = await getCircles(circle?._id);

    return (
        <ContentDisplayWrapper content={circles}>
            <CirclesList circle={circle} circles={circles} page={page} isDefaultCircle={isDefaultCircle} />
        </ContentDisplayWrapper>
    );
}
