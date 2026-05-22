"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Circle } from "@/models/models";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
    approveAdminRoleRemovalRequestAction,
    declineAdminRoleRemovalRequestAction,
} from "@/components/modules/members/actions";

type AdminRoleRemovalBannerProps = {
    circle: Circle;
    requestId: string;
    requesterName?: string;
};

export default function AdminRoleRemovalBanner({
    circle,
    requestId,
    requesterName,
}: AdminRoleRemovalBannerProps): React.ReactElement {
    const router = useRouter();
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const [decision, setDecision] = useState<"approve" | "decline" | null>(null);

    const runAction = (nextDecision: "approve" | "decline") => {
        setDecision(nextDecision);
        startTransition(async () => {
            const result =
                nextDecision === "approve"
                    ? await approveAdminRoleRemovalRequestAction(requestId, circle)
                    : await declineAdminRoleRemovalRequestAction(requestId, circle);

            toast({
                title: result.success ? "Updated" : "Error",
                description: result.message || "Request failed.",
                variant: result.success ? undefined : "destructive",
            });

            if (result.success) {
                router.refresh();
            }

            setDecision(null);
        });
    };

    return (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <div className="space-y-3">
                <div className="space-y-1">
                    <h2 className="text-base font-semibold text-amber-950">Admin role removal request</h2>
                    <p className="text-sm text-amber-900">
                        There is a request to remove your admin role in this circle.
                    </p>
                    {requesterName ? (
                        <p className="text-sm text-amber-900">
                            Requested by: <span className="font-medium">{requesterName}</span>
                        </p>
                    ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        disabled={isPending}
                        onClick={() => runAction("approve")}
                    >
                        {decision === "approve" ? "Approving..." : "Approve"}
                    </Button>
                    <Button
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => runAction("decline")}
                    >
                        {decision === "decline" ? "Declining..." : "Decline"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
