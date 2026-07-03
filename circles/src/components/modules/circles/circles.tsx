"use server";

import { getCommunityCirclesWithRelationships } from "@/lib/data/circle";
import CirclesList from "./circles-list";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { Circle, SortingOptions } from "@/models/models";

type PageProps = { circle: Circle; searchParams?: Promise<{ [key: string]: string | string[] | undefined }> };

export default async function CirclesModule(props: PageProps) {
    const circle = props.circle;
    const searchParams = await props.searchParams;
    const sdgHandles = (searchParams?.sdgs as string)?.split(",") || [];

    // get user handle
    let userDid = await getAuthenticatedUserDid();

    // get all circles or projects based on the page
    let circles = await getCommunityCirclesWithRelationships(
        userDid,
        String(circle._id),
        searchParams?.sort as SortingOptions,
        sdgHandles,
    );

    return (
        <ContentDisplayWrapper content={circles}>
            <CirclesList circle={circle} circles={circles} />
        </ContentDisplayWrapper>
    );
}
