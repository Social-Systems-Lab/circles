"use server";

import { ModulePageProps } from "../dynamic-page";
import { getMembers, getMembersWithMetrics } from "@/lib/data/member";
import MembersTable from "./members-table";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { SortingOptions } from "@/models/models";

export default async function MembersModule({ circle, page, subpage, isDefaultCircle, searchParams }: ModulePageProps) {
    // get members of circle
    let userDid = await getAuthenticatedUserDid();
    let members = await getMembersWithMetrics(userDid, circle?._id, searchParams?.sort as SortingOptions);
    if (circle?.circleType === "user") {
        members = members.filter((m) => m.userDid !== circle.did);
    }

    return (
        <ContentDisplayWrapper content={members}>
            <MembersTable circle={circle} members={members} page={page} isDefaultCircle={isDefaultCircle} />
        </ContentDisplayWrapper>
    );
}
