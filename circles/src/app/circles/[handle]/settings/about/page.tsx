import { AboutSettingsForm } from "@/components/forms/circle-settings/about-settings-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import {
    getAffiliatedCirclesForCircle,
    getCircleByHandle,
    getCircleById,
    getCirclePublishStatus,
} from "@/lib/data/circle";
import { getPendingAttachCircleRequest, getPendingIncomingAttachCircleRequests } from "@/lib/data/circle-attach";
import { getPendingDetachCircleRequest } from "@/lib/data/circle-detach";
import { getMember, getMembers } from "@/lib/data/member";
import { publishCircleAction, submitCircleForVerificationAction } from "./actions";
import { CircleVerificationThreadCard } from "./circle-verification-thread-card";
import { CircleStructureCard } from "./circle-structure-card";
import { getVerificationReadiness } from "@/lib/verification-readiness";
import { VerificationReadinessChecklist } from "@/components/modules/verification/verification-readiness-checklist";
import { features } from "@/lib/data/constants";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AboutSettingsPage(props: PageProps) {
    const params = await props.params;
    const { handle } = params;
    const circle = await getCircleByHandle(handle);

    if (!circle) {
        return <div>Circle not found</div>;
    }

    const userDid = await getAuthenticatedUserDid();
    const parentCircle = circle.parentCircleId ? await getCircleById(circle.parentCircleId) : undefined;
    const member = userDid && circle._id ? await getMember(userDid, String(circle._id)) : null;
    const adminMembers =
        circle._id && circle.circleType !== "user"
            ? (await getMembers(String(circle._id))).filter((member) => member.userGroups?.includes("admins"))
            : [];
    const pendingAttachRequest = circle._id ? await getPendingAttachCircleRequest(String(circle._id)) : null;
    const pendingDetachRequest = circle._id ? await getPendingDetachCircleRequest(String(circle._id)) : null;
    const incomingAttachRequests =
        circle._id && member?.userGroups?.includes("admins")
            ? await getPendingIncomingAttachCircleRequests(String(circle._id))
            : [];
    const incomingAttachRequestCircleIds = Array.from(
        new Set(
            incomingAttachRequests.flatMap((request) => [request.circleId, request.fromParentCircleId || ""]).filter(Boolean),
        ),
    );
    const incomingAttachRequestCircles = await Promise.all(
        incomingAttachRequestCircleIds.map((circleId) => getCircleById(circleId)),
    );
    const pendingAttachTargetParent = pendingAttachRequest
        ? await getCircleById(pendingAttachRequest.toParentCircleId)
        : null;
    const affiliatedCircles = circle._id ? await getAffiliatedCirclesForCircle(String(circle._id)) : [];
    const canManageAffiliations =
        userDid && circle._id ? await isAuthorized(userDid, String(circle._id), features.settings.edit_about) : false;

    const publishStatus = getCirclePublishStatus(circle);
    const showWorkflowCard = circle.circleType !== "user";
    const isDraft = publishStatus === "draft";
    const resolvedCircleLevel = circle.circleLevel ?? (circle.parentCircleId ? "profile_child" : "top_level");
    const isProfileCircle = resolvedCircleLevel === "profile_child";
    const verificationReadiness = getVerificationReadiness(circle);
    const statusCopy =
        publishStatus === "draft"
            ? "Draft"
            : publishStatus === "pending_verification"
              ? "Pending verification"
              : "Published";
    const statusClassName =
        publishStatus === "draft"
            ? "border-amber-200 bg-amber-100 text-amber-900"
            : publishStatus === "pending_verification"
              ? "border-sky-200 bg-sky-100 text-sky-900"
              : "border-emerald-200 bg-emerald-100 text-emerald-900";

    return (
        <div className="container py-6">
            <h1 className="mb-6 text-2xl font-bold">About Settings</h1>
            <p className="mb-6 text-muted-foreground">
                Manage your circle&apos;s profile information, including name, description, mission, and images.
            </p>
            {showWorkflowCard ? (
                <div className="mb-6 rounded-lg border bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-muted-foreground">Status</span>
                                <Badge className={statusClassName}>{statusCopy}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {publishStatus === "draft"
                                    ? "This circle is saved as a draft and is not publicly live yet."
                                    : publishStatus === "pending_verification"
                                      ? "This circle is waiting for verification and is not publicly live yet."
                                      : "This circle is live and behaves like existing published circles."}
                            </p>
                            {!isProfileCircle && circle.representsOrganization ? (
                                <p className="text-sm text-muted-foreground">
                                    This verification will be reviewed as an organization claim using the website and
                                    official email you provided.
                                </p>
                            ) : null}
                            {!isProfileCircle && isDraft && !verificationReadiness.isReady ? (
                                <VerificationReadinessChecklist readiness={verificationReadiness} />
                            ) : null}
                        </div>
                        {isDraft ? (
                            isProfileCircle ? (
                                <form action={publishCircleAction}>
                                    <input type="hidden" name="circleId" value={circle._id} />
                                    <Button type="submit">Publish circle</Button>
                                </form>
                            ) : (
                                <form action={submitCircleForVerificationAction}>
                                    <input type="hidden" name="circleId" value={circle._id} />
                                    <Button type="submit" variant="outline" disabled={!verificationReadiness.isReady}>
                                        Submit for verification
                                    </Button>
                                </form>
                            )
                        ) : null}
                    </div>
                </div>
            ) : null}
            {showWorkflowCard && !isProfileCircle && publishStatus === "pending_verification" ? (
                <CircleVerificationThreadCard circleId={String(circle._id)} />
            ) : null}
            {showWorkflowCard && circle._id ? (
                <CircleStructureCard
                    circleId={String(circle._id)}
                    adminCount={adminMembers.length}
                    isAdmin={member?.userGroups?.includes("admins") === true}
                    canManageAffiliations={canManageAffiliations}
                    isIndependent={resolvedCircleLevel !== "profile_child"}
                    circleHandle={circle.handle || ""}
                    parentCircleName={parentCircle?.name || "this parent circle"}
                    affiliatedCircles={affiliatedCircles.map((affiliatedCircle) => ({
                        id: affiliatedCircle._id?.toString?.() ?? "",
                        name: affiliatedCircle.name || "Untitled circle",
                        handle: affiliatedCircle.handle || "",
                    }))}
                    pendingAttachRequest={
                        pendingAttachRequest
                            ? {
                                  requestId: pendingAttachRequest._id?.toString?.() ?? "",
                                  status: pendingAttachRequest.status,
                                  targetParentName: pendingAttachTargetParent?.name || "the requested parent",
                              }
                            : null
                    }
                    pendingRequest={
                        pendingDetachRequest
                            ? {
                                  requestId: pendingDetachRequest._id?.toString?.() ?? "",
                                  approvedByDids: pendingDetachRequest.approvedByDids,
                                  requiredAdmins: pendingDetachRequest.requiredAdminDids.map((did) => {
                                      const admin = adminMembers.find((member) => member.userDid === did);
                                      return {
                                          did,
                                          name: admin?.name || admin?.handle || did.slice(0, 12),
                                      };
                                  }),
                              }
                            : null
                    }
                    incomingAttachRequests={incomingAttachRequests.map((request) => {
                        const movingCircle = incomingAttachRequestCircles.find(
                            (requestCircle) => requestCircle?._id?.toString?.() === request.circleId,
                        );
                        const fromParentCircle = incomingAttachRequestCircles.find(
                            (requestCircle) => requestCircle?._id?.toString?.() === request.fromParentCircleId,
                        );

                        return {
                            requestId: request._id?.toString?.() ?? "",
                            movingCircleName: movingCircle?.name || "This circle",
                            movingCircleHandle: movingCircle?.handle || "",
                            fromParentCircleName: fromParentCircle?.name || null,
                        };
                    })}
                    viewerDid={userDid || null}
                />
            ) : null}
            <AboutSettingsForm circle={circle} />
        </div>
    );
}
