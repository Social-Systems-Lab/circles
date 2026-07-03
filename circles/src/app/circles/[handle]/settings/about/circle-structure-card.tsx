"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import {
    approveAttachCircleRequestAction,
    addCircleAffiliationAction,
    createAttachCircleRequestAction,
    declineAttachCircleRequestAction,
    approveDetachCircleRequestAction,
    createDetachCircleRequestAction,
    declineDetachCircleRequestAction,
    removeCircleAffiliationAction,
} from "./actions";

type RequiredAdmin = {
    did: string;
    name: string;
};

type PendingRequest = {
    requestId: string;
    approvedByDids: string[];
    requiredAdmins: RequiredAdmin[];
};

type PendingAttachRequest = {
    requestId: string;
    status: string;
    targetParentName: string;
};

type IncomingAttachRequest = {
    requestId: string;
    movingCircleName: string;
    movingCircleHandle: string;
    fromParentCircleName: string | null;
};

type AffiliatedCircle = {
    id: string;
    name: string;
    handle: string;
};

type CircleStructureCardProps = {
    circleId: string;
    circleHandle: string;
    adminCount: number;
    isAdmin: boolean;
    canManageAffiliations: boolean;
    isIndependent: boolean;
    parentCircleName: string;
    affiliatedCircles: AffiliatedCircle[];
    pendingAttachRequest: PendingAttachRequest | null;
    pendingRequest: PendingRequest | null;
    incomingAttachRequests: IncomingAttachRequest[];
    viewerDid: string | null;
};

export function CircleStructureCard({
    circleId,
    circleHandle,
    adminCount,
    isAdmin,
    canManageAffiliations,
    isIndependent,
    parentCircleName,
    affiliatedCircles,
    pendingAttachRequest,
    pendingRequest,
    incomingAttachRequests,
    viewerDid,
}: CircleStructureCardProps): React.ReactElement {
    const router = useRouter();
    const { toast } = useToast();
    const [action, setAction] = useState<
        | "create"
        | "approve"
        | "decline"
        | "create-attach"
        | "approve-attach"
        | "decline-attach"
        | "add-affiliation"
        | "remove-affiliation"
        | null
    >(null);
    const [targetParentHandle, setTargetParentHandle] = useState("");
    const [affiliatedCircleHandle, setAffiliatedCircleHandle] = useState("");

    const isPending = Boolean(pendingRequest);
    const isAttachPending = Boolean(pendingAttachRequest);
    const requiredAdminCount = pendingRequest?.requiredAdmins.length ?? 0;
    const viewerIsRequiredAdmin = Boolean(viewerDid && pendingRequest?.requiredAdmins.some((admin) => admin.did === viewerDid));
    const viewerHasApproved = Boolean(viewerDid && pendingRequest?.approvedByDids.includes(viewerDid));

    const runAction = async (
        nextAction:
            | "create"
            | "approve"
            | "decline"
            | "create-attach"
            | "approve-attach"
            | "decline-attach"
            | "add-affiliation"
            | "remove-affiliation",
        actionPromise: Promise<{ success: boolean; message?: string }>,
    ) => {
        setAction(nextAction);
        try {
            const result = await actionPromise;
            toast({
                title: result.success ? "Updated" : "Error",
                description: result.message || "Request failed.",
                variant: result.success ? undefined : "destructive",
            });
            if (result.success) {
                if (nextAction === "create-attach") {
                    setTargetParentHandle("");
                }
                if (nextAction === "add-affiliation") {
                    setAffiliatedCircleHandle("");
                }
                router.refresh();
            }
        } catch {
            toast({
                title: "Error",
                description: "An unexpected error occurred.",
                variant: "destructive",
            });
        } finally {
            setAction(null);
        }
    };

    return (
        <div className="mb-6 rounded-lg border bg-white p-4 shadow-sm">
            <div className="space-y-3">
                <div className="space-y-1">
                    <h2 className="text-base font-semibold">Circle structure</h2>
                    <p className="text-sm text-muted-foreground">
                        {isIndependent
                            ? "This is an independent circle."
                            : `This circle is part of ${parentCircleName}.`}
                    </p>
                    {isAttachPending ? (
                        <p className="text-sm text-muted-foreground">
                            A move request to attach this circle under {pendingAttachRequest?.targetParentName} is pending.
                        </p>
                    ) : null}
                    {!isIndependent && !isPending ? (
                        <p className="text-sm text-muted-foreground">
                            {isAdmin
                                ? "Making it independent will detach only this circle. Its child circles stay attached."
                                : "Only circle admins can make this circle independent."}
                        </p>
                    ) : null}
                    {isPending ? (
                        <p className="text-sm text-muted-foreground">
                            {requiredAdminCount > 1
                                ? "This detach request is pending approval from all current admins fixed at request time."
                                : "This detach request is pending."}
                        </p>
                    ) : null}
                </div>

                {pendingRequest ? (
                    <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                        <div className="text-sm font-medium text-amber-900">Detach request pending</div>
                        <div className="space-y-1 text-sm text-amber-900">
                            {pendingRequest.requiredAdmins.map((admin) => {
                                const approved = pendingRequest.approvedByDids.includes(admin.did);
                                return (
                                    <div key={admin.did}>
                                        {admin.name}: {approved ? "Approved" : "Waiting"}
                                    </div>
                                );
                            })}
                        </div>
                        {isAdmin && viewerIsRequiredAdmin ? (
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="outline"
                                    disabled={action !== null || viewerHasApproved}
                                    onClick={() =>
                                        runAction(
                                            "approve",
                                            approveDetachCircleRequestAction(pendingRequest.requestId),
                                        )
                                    }
                                >
                                    {action === "approve" ? "Approving..." : viewerHasApproved ? "Approved" : "Approve"}
                                </Button>
                                <Button
                                    variant="destructive"
                                    disabled={action !== null}
                                    onClick={() =>
                                        runAction(
                                            "decline",
                                            declineDetachCircleRequestAction(pendingRequest.requestId),
                                        )
                                    }
                                >
                                    {action === "decline" ? "Declining..." : "Decline"}
                                </Button>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {pendingAttachRequest ? (
                    <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50 p-3">
                        <div className="text-sm font-medium text-sky-900">Move request pending</div>
                        <p className="text-sm text-sky-900">
                            Target parent: {pendingAttachRequest.targetParentName}
                        </p>
                    </div>
                ) : null}

                {incomingAttachRequests.length > 0 ? (
                    <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                        <div className="text-sm font-medium text-emerald-900">Incoming parent-change requests</div>
                        <div className="space-y-3">
                            {incomingAttachRequests.map((request) => (
                                <div key={request.requestId} className="space-y-2 rounded-md border border-emerald-200 bg-white p-3">
                                    <p className="text-sm text-emerald-900">
                                        {request.movingCircleName}
                                        {request.movingCircleHandle ? ` (@${request.movingCircleHandle})` : ""} wants to move under this circle.
                                    </p>
                                    <p className="text-sm text-emerald-900">
                                        Current parent: {request.fromParentCircleName || "Independent"}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            variant="outline"
                                            disabled={action !== null}
                                            onClick={() =>
                                                runAction(
                                                    "approve-attach",
                                                    approveAttachCircleRequestAction(request.requestId),
                                                )
                                            }
                                        >
                                            {action === "approve-attach" ? "Approving..." : "Approve move"}
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            disabled={action !== null}
                                            onClick={() =>
                                                runAction(
                                                    "decline-attach",
                                                    declineAttachCircleRequestAction(request.requestId),
                                                )
                                            }
                                        >
                                            {action === "decline-attach" ? "Declining..." : "Decline"}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {!isAttachPending && !isPending && isAdmin ? (
                    <div className="space-y-2 rounded-md border p-3">
                        <div className="space-y-1">
                            <div className="text-sm font-medium">Request move to another parent</div>
                            <p className="text-sm text-muted-foreground">
                                Enter the target parent circle handle. This only changes this circle&apos;s parent. Child circles stay attached here.
                            </p>
                        </div>
                        <Input
                            value={targetParentHandle}
                            onChange={(event) => setTargetParentHandle(event.target.value)}
                            placeholder={circleHandle ? `${circleHandle}-parent-handle` : "target-parent-handle"}
                            disabled={action !== null}
                        />
                        <Button
                            variant="outline"
                            disabled={action !== null || !targetParentHandle.trim()}
                            onClick={() =>
                                runAction(
                                    "create-attach",
                                    createAttachCircleRequestAction(circleId, targetParentHandle),
                                )
                            }
                        >
                            {action === "create-attach" ? "Submitting..." : "Request move"}
                        </Button>
                    </div>
                ) : null}

                {canManageAffiliations ? (
                    <div className="space-y-3 rounded-md border p-3">
                        <div className="space-y-1">
                            <div className="text-sm font-medium">Affiliations</div>
                            <p className="text-sm text-muted-foreground">
                                Affiliated circles appear under this circle for visibility and alignment. This does not change ownership or governance.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                                value={affiliatedCircleHandle}
                                onChange={(event) => setAffiliatedCircleHandle(event.target.value)}
                                placeholder="affiliated-circle-handle"
                                disabled={action !== null}
                            />
                            <Button
                                variant="outline"
                                disabled={action !== null || !affiliatedCircleHandle.trim()}
                                onClick={() =>
                                    runAction(
                                        "add-affiliation",
                                        addCircleAffiliationAction(circleId, affiliatedCircleHandle),
                                    )
                                }
                            >
                                {action === "add-affiliation" ? "Adding..." : "Add affiliation"}
                            </Button>
                        </div>
                        <div className="space-y-2">
                            {affiliatedCircles.length > 0 ? (
                                affiliatedCircles.map((affiliatedCircle) => (
                                    <div
                                        key={affiliatedCircle.id}
                                        className="flex flex-col gap-2 rounded-md border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div>
                                            <div className="text-sm font-medium">{affiliatedCircle.name}</div>
                                            {affiliatedCircle.handle ? (
                                                <div className="text-sm text-muted-foreground">
                                                    @{affiliatedCircle.handle}
                                                </div>
                                            ) : null}
                                        </div>
                                        <Button
                                            variant="outline"
                                            disabled={action !== null}
                                            onClick={() =>
                                                runAction(
                                                    "remove-affiliation",
                                                    removeCircleAffiliationAction(circleId, affiliatedCircle.id),
                                                )
                                            }
                                        >
                                            {action === "remove-affiliation" ? "Removing..." : "Remove"}
                                        </Button>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground">No affiliated circles yet.</p>
                            )}
                        </div>
                    </div>
                ) : null}

                {!isIndependent && !isPending && !isAttachPending && isAdmin ? (
                    <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                            {adminCount > 1
                                ? "All current admins will need to approve the detach request."
                                : "This circle has one admin, so detaching it will happen immediately."}
                        </p>
                        <Button
                            variant="outline"
                            disabled={action !== null}
                            onClick={() => runAction("create", createDetachCircleRequestAction(circleId))}
                        >
                            {action === "create" ? "Submitting..." : "Make independent circle"}
                        </Button>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
