"use server";

import { ModulePageProps } from "../dynamic-page";
import { getCircles, getCirclesWithMetrics } from "@/lib/data/circle";
import CirclesList from "./circles-list";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUserByDid } from "@/lib/data/user";

export default async function CirclesModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    // get user handle
    let userDid = undefined;
    try {
        userDid = await getAuthenticatedUserDid();
    } catch (error) {}

    // get all circles
    let circles = await getCirclesWithMetrics(userDid, circle?._id);

    return (
        <ContentDisplayWrapper content={circles}>
            <CirclesList circle={circle} circles={circles} page={page} isDefaultCircle={isDefaultCircle} />
        </ContentDisplayWrapper>
    );
}
