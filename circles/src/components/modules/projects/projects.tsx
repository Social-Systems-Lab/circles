"use server";

import { getCirclesWithMetrics } from "@/lib/data/circle";
import CirclesList from "../circles/circles-list";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { Circle, SortingOptions } from "@/models/models";

type PageProps = {
    circle: Circle;
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ProjectsModule(props: PageProps) {
    const circle = props.circle;
    const searchParams = await props.searchParams;

    // get user handle
    let userDid = await getAuthenticatedUserDid();

    // Always get project type circles for this module
    let projects = await getCirclesWithMetrics(userDid, circle?._id, searchParams?.sort as SortingOptions, "project");

    return (
        <ContentDisplayWrapper content={projects}>
            <CirclesList circle={circle} circles={projects} isProjectsList={true} />
        </ContentDisplayWrapper>
    );
}
