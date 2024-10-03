"use server";

import { ModulePageProps } from "../dynamic-page";
import { getMembers, getMembersWithMetrics } from "@/lib/data/member";
import MembersTable from "./members-table";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";

export default async function MembersModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    // get members of circle
    let userDid = undefined;
    try {
        userDid = await getAuthenticatedUserDid();
    } catch (error) {}

    let members = await getMembersWithMetrics(userDid, circle?._id);
    if (circle?.circleType === "user") {
        members = members.filter((m) => m.userDid !== circle.did);
    }

    return (
        <ContentDisplayWrapper content={members}>
            <MembersTable circle={circle} members={members} page={page} isDefaultCircle={isDefaultCircle} />
        </ContentDisplayWrapper>
    );
}
