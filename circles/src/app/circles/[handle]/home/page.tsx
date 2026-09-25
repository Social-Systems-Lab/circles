import React from "react";
import { notFound } from "next/navigation";
import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import AboutPage from "@/components/modules/home/AboutPage";
import { getTasksByCircleId } from "@/lib/data/task";
import { features } from "@/lib/data/constants";
import { getShiftEndAt, getShiftStartAt, isShiftTask } from "@/components/modules/tasks/shift-task-utils";
import type { TaskDisplay } from "@/models/models";
import type { FundingAskDisplay } from "@/models/models";
import { getFundingCirclePermissions, isFundingEnabledForCircle, listFundingAsksByCircleId } from "@/lib/data/funding";
import { getMembers } from "@/lib/data/member";
import { getHumanityVerificationSummary } from "@/lib/data/proof-of-humanity";
import { getProfileContributionPanelData } from "./profile-contribution-panel-data";
import { buildAboutPageClientProps, type ServerVerifiedContributionInput } from "@/lib/data/client-circle-dto";
import { canReadCircle } from "@/lib/data/circle-visibility-policy";
import { resolveCircleRouteAccess } from "../circle-route-access";
import type { MemberDisplay } from "@/models/models";

// TODO: Add error handling and loading states more robustly

type PageProps = {
    params: Promise<{ handle: string }>;
};

export default async function CircleHomePage(props: PageProps) {
    const { handle } = await props.params;
    const access = await resolveCircleRouteAccess(handle, {
        findCircle: getCircleByHandle,
        authenticate: getAuthenticatedUserDid,
        canReadCircle,
    });
    if (!access) notFound();
    const { circle, viewerDid } = access;

    let verifiedContributions: ServerVerifiedContributionInput[] = [];
    let verifiedContributionPublicCount = 0;
    let fundingPreviewAsks: FundingAskDisplay[] = [];
    let fundingPanelVisibility: "visible" | "sign_in" | "members_only" = viewerDid ? "members_only" : "sign_in";
    let upcomingShiftTasks: TaskDisplay[] = [];
    let upcomingShiftsVisibility: "visible" | "sign_in" | "members_only" = viewerDid ? "members_only" : "sign_in";
    let canCreateFundingAsk = false;
    const proofOfHumanitySummary =
        circle.circleType === "user" && circle.did ? await getHumanityVerificationSummary(circle.did, viewerDid) : null;
    const showFundingPanel = isFundingEnabledForCircle(circle);
    const showUpcomingShiftsPanel = circle.circleType !== "user" && (circle.enabledModules?.includes("tasks") ?? false);
    const showAdminsPublicly = circle.showAdminsPublicly !== false;
    let adminLeaders: MemberDisplay[] = [];
    if (showAdminsPublicly && circle.circleType !== "user" && circle._id) {
        const adminMembers = (await getMembers(circle._id)).filter((member) => member.userGroups?.includes("admins"));
        const visibleAdmins = await Promise.all(
            adminMembers.map(async (member) => {
                if (!member.handle) return null;
                const profile = await getCircleByHandle(member.handle);
                return profile && (await canReadCircle(viewerDid, profile))
                    ? ({ ...member, ...profile, userGroups: member.userGroups } as MemberDisplay)
                    : null;
            }),
        );
        adminLeaders = visibleAdmins.filter((member): member is MemberDisplay => member !== null).slice(0, 6);
    }

    if (circle.circleType === "user" && circle.did) {
        const { items, totalPublicCount } = await getProfileContributionPanelData(circle.did, viewerDid);
        verifiedContributionPublicCount = totalPublicCount;
        verifiedContributions = items;
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

    const aboutPageProps = buildAboutPageClientProps({
        circle,
        viewerDid,
        adminLeaders,
        verifiedContributions,
        verifiedContributionPublicCount,
        fundingPreviewAsks,
        fundingPanelVisibility,
        upcomingShiftTasks,
        upcomingShiftsVisibility,
        canCreateFundingAsk,
        showFundingPanel,
        showUpcomingShiftsPanel,
        proofOfHumanitySummary,
    });

    return <AboutPage {...aboutPageProps} />;
}
