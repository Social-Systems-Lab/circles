"use server";

import { getPendingAdminRoleRemovalRequest } from "@/lib/data/admin-role-removal";
import { getMembersWithMetrics } from "@/lib/data/member";
import { getUserPrivate } from "@/lib/data/user";
import AdminRoleRemovalBanner from "./admin-role-removal-banner";
import MembersTable from "./members-table";
import ContentDisplayWrapper from "@/components/utils/content-display-wrapper";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { Circle, SortingOptions } from "@/models/models";

type PageProps = {
    circle: Circle;
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function MembersModule(props: PageProps) {
    const circle = props.circle;
    const searchParams = await props.searchParams;

    // get members of circle
    let userDid = await getAuthenticatedUserDid();
    let members = await getMembersWithMetrics(userDid, circle?._id, searchParams?.sort as SortingOptions);
    const pendingAdminRoleRemovalRequest =
        userDid && circle?._id ? await getPendingAdminRoleRemovalRequest(circle._id, userDid) : null;
    const requester =
        pendingAdminRoleRemovalRequest?.requestedByDid
            ? await getUserPrivate(pendingAdminRoleRemovalRequest.requestedByDid)
            : null;
    if (circle?.circleType === "user") {
        members = members.filter((m) => m.userDid !== circle.did);
    }

    return (
        <ContentDisplayWrapper content={members}>
            {pendingAdminRoleRemovalRequest ? (
                <AdminRoleRemovalBanner
                    circle={circle}
                    requestId={pendingAdminRoleRemovalRequest._id?.toString?.() ?? ""}
                    requesterName={requester?.name}
                />
            ) : null}
            <MembersTable circle={circle} members={members} />
        </ContentDisplayWrapper>
    );
}
