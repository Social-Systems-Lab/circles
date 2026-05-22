"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
    approveDetachCircleRequestAction,
    createDetachCircleRequestAction,
    declineDetachCircleRequestAction,
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

type CircleStructureCardProps = {
    circleId: string;
    adminCount: number;
    isAdmin: boolean;
    isIndependent: boolean;
    parentCircleName: string;
    pendingRequest: PendingRequest | null;
    viewerDid: string | null;
};

export function CircleStructureCard({
    circleId,
    adminCount,
    isAdmin,
    isIndependent,
    parentCircleName,
    pendingRequest,
    viewerDid,
}: CircleStructureCardProps): React.ReactElement {
    const router = useRouter();
    const { toast } = useToast();
    const [action, setAction] = useState<"create" | "approve" | "decline" | null>(null);

    const isPending = Boolean(pendingRequest);
    const requiredAdminCount = pendingRequest?.requiredAdmins.length ?? 0;
    const viewerIsRequiredAdmin = Boolean(viewerDid && pendingRequest?.requiredAdmins.some((admin) => admin.did === viewerDid));
    const viewerHasApproved = Boolean(viewerDid && pendingRequest?.approvedByDids.includes(viewerDid));

    const runAction = async (
        nextAction: "create" | "approve" | "decline",
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

                {!isIndependent && !isPending && isAdmin ? (
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
