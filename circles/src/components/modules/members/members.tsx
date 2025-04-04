"use server";

import { ModulePageProps } from "../dynamic-page";
import { getMembers, getMembersWithMetrics } from "@/lib/data/member";
import MembersTable from "./members-table";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { Page, SortingOptions } from "@/models/models";

export default async function MembersModule({ circle, page, moduleHandle, subpage, searchParams }: ModulePageProps) {
    // get members of circle
    let userDid = await getAuthenticatedUserDid();
    let members = await getMembersWithMetrics(userDid, circle?._id, searchParams?.sort as SortingOptions);
    if (circle?.circleType === "user") {
        members = members.filter((m) => m.userDid !== circle.did);
    }

    // Create a default page object if one isn't provided
    const defaultPage: Page = {
        name: "Followers",
        handle: "followers",
        description: "Followers page",
        module: "followers",
    };

    return (
        <ContentDisplayWrapper content={members}>
            <MembersTable circle={circle} members={members} page={page || defaultPage} />
        </ContentDisplayWrapper>
    );
}
