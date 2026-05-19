import React from "react";
import { notFound } from "next/navigation";
import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import AboutPage from "@/components/modules/home/AboutPage";
import type { VerifiedContributionItem } from "@/components/modules/home/VerifiedContributionsPanel";
import { getTasksByCircleId, getVerifiedTasksForUser } from "@/lib/data/task";
import { features } from "@/lib/data/constants";
import { getShiftEndAt, getShiftStartAt, isShiftTask } from "@/components/modules/tasks/shift-task-utils";
import type { TaskDisplay, TaskPermissions } from "@/models/models";
import type { FundingAskDisplay } from "@/models/models";
import { getFundingCirclePermissions, isFundingEnabledForCircle, listFundingAsksByCircleId } from "@/lib/data/funding";
import { getMember, getMembers } from "@/lib/data/member";
import { getHumanityVerificationSummary } from "@/lib/data/proof-of-humanity";
import { getUserPrivate } from "@/lib/data/user";
import {
    createCircleMembershipCredentialCard,
    getLinkedVibeIdDid,
    type CircleMembershipCredentialCardData,
} from "@/lib/vibe-id/membership-credentials";

// TODO: Add error handling and loading states more robustly

type PageProps = {
    params: Promise<{ handle: string }>;
};

export default async function CircleHomePage(props: PageProps) {
    const { handle } = await props.params;
    const viewerDid = await getAuthenticatedUserDid();

    // Fetch circle data
    const circle = await getCircleByHandle(handle);
    if (!circle) {
        notFound();
    }

    let verifiedContributions: VerifiedContributionItem[] = [];
    let verifiedContributionPublicCount = 0;
    let fundingPreviewAsks: FundingAskDisplay[] = [];
    let fundingPanelVisibility: "visible" | "sign_in" | "members_only" = viewerDid ? "members_only" : "sign_in";
    let upcomingShiftTasks: TaskDisplay[] = [];
    let upcomingShiftsVisibility: "visible" | "sign_in" | "members_only" = viewerDid ? "members_only" : "sign_in";
    let canCreateFundingAsk = false;
    let membershipCredential: CircleMembershipCredentialCardData | null = null;
    const proofOfHumanitySummary =
        circle.circleType === "user" && circle.did ? await getHumanityVerificationSummary(circle.did, viewerDid) : null;
    const showFundingPanel = isFundingEnabledForCircle(circle);
    const showUpcomingShiftsPanel = circle.circleType !== "user" && (circle.enabledModules?.includes("tasks") ?? false);
    const showAdminsPublicly = circle.showAdminsPublicly !== false;
    const adminLeaders =
        showAdminsPublicly && circle.circleType !== "user" && circle._id
            ? (await getMembers(circle._id)).filter((member) => member.userGroups?.includes("admins")).slice(0, 6)
            : [];

    if (circle.circleType === "user" && circle.did) {
        const { totalPublicCount, visibleTasks } = await getVerifiedTasksForUser(circle.did, viewerDid);
        const permissionsByCircleId = new Map<string, TaskPermissions>();
        verifiedContributionPublicCount = totalPublicCount;

        verifiedContributions = (
            await Promise.all(
                visibleTasks.map(async (task) => {
                    if (!task.circle?._id) {
                        return null;
                    }

                    let permissions = permissionsByCircleId.get(task.circle._id);
                    if (!permissions) {
                        permissions = {
                            canModerate: await isAuthorized(viewerDid, task.circle._id, features.tasks.moderate),
                            canReview: await isAuthorized(viewerDid, task.circle._id, features.tasks.review),
                            canAssign: await isAuthorized(viewerDid, task.circle._id, features.tasks.assign),
                            canResolve: await isAuthorized(viewerDid, task.circle._id, features.tasks.resolve),
                            canComment: await isAuthorized(viewerDid, task.circle._id, features.tasks.comment),
                        };
                        permissionsByCircleId.set(task.circle._id, permissions);
                    }

                    return {
                        task,
                        circle: task.circle,
                        permissions,
                    };
                }),
            )
        ).filter((item): item is VerifiedContributionItem => item !== null);
    }

    if (showFundingPanel && viewerDid) {
        const fundingPermissions = await getFundingCirclePermissions(circle, viewerDid);
        canCreateFundingAsk = fundingPermissions.canCreate;
        fundingPanelVisibility = fundingPermissions.canView ? "visible" : "members_only";

        if (fundingPermissions.canView) {
            fundingPreviewAsks = await listFundingAsksByCircleId(circle, {
                viewerDid,
                limit: 3,
            });
        }
    }

    if (showUpcomingShiftsPanel && circle._id && viewerDid) {
        const canViewTasks = await isAuthorized(viewerDid, circle._id as string, features.tasks.view);
        upcomingShiftsVisibility = canViewTasks ? "visible" : viewerDid ? "members_only" : "sign_in";

        if (canViewTasks) {
            const now = new Date();
            const tasks = await getTasksByCircleId(circle._id as string, viewerDid);
            upcomingShiftTasks = tasks
                .filter((task) => {
                    if (!isShiftTask(task)) {
                        return false;
                    }

                    if (task.stage === "review" || task.stage === "resolved") {
                        return false;
                    }

                    if (!task.slots || task.slots < 1) {
                        return false;
                    }

                    const signedUpCount = task.participants?.length ?? 0;
                    if (signedUpCount >= task.slots) {
                        return false;
                    }

                    const startAt = getShiftStartAt(task);
                    const endAt = getShiftEndAt(task);
                    if (!startAt) {
                        return false;
                    }

                    return endAt ? endAt >= now : startAt >= now;
                })
                .sort((left, right) => {
                    const leftStart = getShiftStartAt(left)?.getTime() ?? Number.MAX_SAFE_INTEGER;
                    const rightStart = getShiftStartAt(right)?.getTime() ?? Number.MAX_SAFE_INTEGER;
                    return leftStart - rightStart;
                })
                .slice(0, 3);
        }
    }

    if (circle.circleType !== "user" && circle._id && viewerDid) {
        const [viewer, member] = await Promise.all([getUserPrivate(viewerDid), getMember(viewerDid, String(circle._id))]);
        const subjectVibeDid = getLinkedVibeIdDid(viewer);
        if (member && subjectVibeDid) {
            membershipCredential = createCircleMembershipCredentialCard({
                circle,
                member,
                subjectVibeDid,
            });
        }
    }

    return (
        <AboutPage
            circle={circle}
            verifiedContributions={verifiedContributions}
            verifiedContributionPublicCount={verifiedContributionPublicCount}
            fundingPreviewAsks={fundingPreviewAsks}
            fundingPanelVisibility={fundingPanelVisibility}
            upcomingShiftTasks={JSON.parse(JSON.stringify(upcomingShiftTasks))}
            upcomingShiftsVisibility={upcomingShiftsVisibility}
            canCreateFundingAsk={canCreateFundingAsk}
            showFundingPanel={showFundingPanel}
            showUpcomingShiftsPanel={showUpcomingShiftsPanel}
            adminLeaders={JSON.parse(JSON.stringify(adminLeaders))}
            proofOfHumanitySummary={proofOfHumanitySummary ? JSON.parse(JSON.stringify(proofOfHumanitySummary)) : null}
            membershipCredential={membershipCredential}
        />
    );
}
