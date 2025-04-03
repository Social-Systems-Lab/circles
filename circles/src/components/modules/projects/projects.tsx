"use server";

import { ModulePageProps } from "../dynamic-page";
import { getCirclesWithMetrics } from "@/lib/data/circle";
import CirclesList from "../circles/circles-list";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { SortingOptions } from "@/models/models";

export default async function ProjectsModule({ circle, page, subpage, searchParams }: ModulePageProps) {
    // get user handle
    let userDid = await getAuthenticatedUserDid();

    // Always get project type circles for this module
    let projects = await getCirclesWithMetrics(userDid, circle?._id, searchParams?.sort as SortingOptions, "project");

    return (
        <ContentDisplayWrapper content={projects}>
            <CirclesList circle={circle} circles={projects} page={page} isProjectsList={true} />
        </ContentDisplayWrapper>
    );
}
