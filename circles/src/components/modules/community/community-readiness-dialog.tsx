"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import type { ParticipationBlockReason } from "@/lib/profile-completion";

type CommunityReadinessCopy = {
    title: string;
    body: string;
    placeholder: string;
    actionLabel: string;
};

export const getCommunityReadinessCopy = (reason: ParticipationBlockReason): CommunityReadinessCopy => {
    if (reason === "email_unverified") {
        return {
            title: "Verify your email to participate",
            body: "You can view this Community, but you need to verify your email before posting, commenting, or reacting.",
            placeholder: "Verify your email to post in the Community",
            actionLabel: "Open profile steps",
        };
    }

    if (reason === "guidelines_incomplete") {
        return {
            title: "Accept the Community Guidelines",
            body: "Review and accept the Community Guidelines before participating.",
            placeholder: "Accept the Community Guidelines to participate",
            actionLabel: "Open profile steps",
        };
    }

    return {
        title: "Complete your profile to participate",
        body: "Finish the required profile steps before posting, commenting, or reacting.",
        placeholder: "Complete your profile to post in the Community",
        actionLabel: "Open profile steps",
    };
};

type CommunityReadinessDialogProps = {
    reason: ParticipationBlockReason;
    profileHref: string;
    children: ReactNode;
};

export function CommunityReadinessDialog({ reason, profileHref, children }: CommunityReadinessDialogProps) {
    const copy = getCommunityReadinessCopy(reason);

    return (
        <Dialog>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{copy.title}</DialogTitle>
                    <DialogDescription>{copy.body}</DialogDescription>
                </DialogHeader>
                <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>Community posting, comments, and reactions unlock when your participation steps are complete.</p>
                </div>
                <DialogFooter>
                    <Button asChild>
                        <Link href={profileHref}>{copy.actionLabel}</Link>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
