"use server";

import { getPendingAdminRoleRemovalRequest } from "@/lib/data/admin-role-removal";
import { getMemberDirectoryForViewer } from "@/lib/data/member";
import { getUserPrivate } from "@/lib/data/user";
import AdminRoleRemovalBanner from "./admin-role-removal-banner";
import MembersTable from "./members-table";
import { getAuthenticatedUserDid, getMemberAccessLevel, isAuthorized } from "@/lib/auth/auth";
import { Circle } from "@/models/models";
import { features } from "@/lib/data/constants";
import { notFound } from "next/navigation";

type PageProps = {
    circle: Circle;
};

export default async function MembersModule(props: PageProps) {
    const circle = props.circle;
    if (!circle._id) notFound();

    const circleId = circle._id.toString();
    const userDid = await getAuthenticatedUserDid();
    const [canEditLower, canEditSameLevel, canRemoveLower, canRemoveSameLevel] = await Promise.all([
        isAuthorized(userDid, circleId, features.general.edit_lower_user_groups),
        isAuthorized(userDid, circleId, features.general.edit_same_level_user_groups),
        isAuthorized(userDid, circleId, features.general.remove_lower_members),
        isAuthorized(userDid, circleId, features.general.remove_same_level_members),
    ]);
    const directory = await getMemberDirectoryForViewer(
        circleId,
        circle,
        userDid,
        canEditLower || canEditSameLevel || canRemoveLower || canRemoveSameLevel,
    );
    if (!directory) notFound();
    const { canManageMembers, members } = directory;
    const pendingAdminRoleRemovalRequest = userDid ? await getPendingAdminRoleRemovalRequest(circleId, userDid) : null;
    const requester = pendingAdminRoleRemovalRequest?.requestedByDid
        ? await getUserPrivate(pendingAdminRoleRemovalRequest.requestedByDid)
        : null;
    const viewerAccessLevel = userDid && canManageMembers ? await getMemberAccessLevel(userDid, circleId) : undefined;
    const circleClient = {
        id: circleId,
        handle: circle.handle ?? "",
        circleType: circle.circleType,
        userGroups: canManageMembers ? (circle.userGroups ?? []) : undefined,
    };

    return (
        <>
            {pendingAdminRoleRemovalRequest ? (
                <AdminRoleRemovalBanner
                    circleId={circleId}
                    requestId={pendingAdminRoleRemovalRequest._id?.toString?.() ?? ""}
                    requesterName={requester?.name}
                />
            ) : null}
            <MembersTable
                circle={circleClient}
                members={members}
                management={{ canEditLower, canEditSameLevel, canRemoveLower, canRemoveSameLevel, viewerAccessLevel }}
            />
        </>
    );
}
