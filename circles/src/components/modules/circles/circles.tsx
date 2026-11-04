"use server";

import { getCommunityCirclesWithRelationships } from "@/lib/data/circle";
import CirclesList from "./circles-list";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { Circle, SortingOptions } from "@/models/models";
import { parseCircleInventoryFilters } from "./circle-list-query-params";

type PageProps = { circle: Circle; searchParams?: Promise<{ [key: string]: string | string[] | undefined }> };

export default async function CirclesModule(props: PageProps) {
    const circle = props.circle;
    const searchParams = await props.searchParams;
    const sdgHandles = (searchParams?.sdgs as string)?.split(",") || [];
    const inventoryFilters = parseCircleInventoryFilters(searchParams);

    // get user handle
    let userDid = await getAuthenticatedUserDid();

    // get all circles or projects based on the page
    let circles = await getCommunityCirclesWithRelationships(
        userDid,
        String(circle._id),
        searchParams?.sort as SortingOptions,
        sdgHandles,
        inventoryFilters.includeCreated,
        inventoryFilters.includeMember,
    );

    return (
        <ContentDisplayWrapper content={circles}>
            <CirclesList circle={circle} circles={circles} initialInventoryFilters={inventoryFilters} />
        </ContentDisplayWrapper>
    );
}
