"use client";

import { useActionState, useEffect, useState } from "react";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { CodeOfConductAgreement } from "@/components/auth/code-of-conduct-agreement";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { isCommunityGuidelinesCompleted } from "@/lib/community-guidelines";
import { userAtom } from "@/lib/data/atoms";
import { getVerificationReadiness } from "@/lib/verification-readiness";
import { VerificationReadinessChecklist } from "@/components/modules/verification/verification-readiness-checklist";
import { getVerificationStatus, requestVerification, RequestVerificationResult } from "./actions";

type DialogMode = "readiness" | "guidelines" | "confirm";

const INITIAL_REQUEST_STATE: RequestVerificationResult = {
    message: "",
};

export function VerifyAccountButton({
    onStatusChange,
}: {
    onStatusChange?: () => void | Promise<void>;
}) {
    const [user, setUser] = useAtom(userAtom);
    const [open, setOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>("confirm");
    const [state, formAction, isSubmitting] = useActionState(requestVerification, INITIAL_REQUEST_STATE);
    const [verificationStatus, setVerificationStatus] = useState<"verified" | "pending" | "unverified">("unverified");
    const { toast } = useToast();
    const router = useRouter();
    const readiness = getVerificationReadiness(user);

    const communityGuidelinesCompleted = isCommunityGuidelinesCompleted(user?.communityGuidelinesAcceptance);
    const activeDialogMode: DialogMode = dialogMode;

    useEffect(() => {
        const fetchStatus = async () => {
            const status = await getVerificationStatus();
            setVerificationStatus(status);
        };
        fetchStatus();
    }, []);

    useEffect(() => {
        if (!state.message) {
            return;
        }

        if (state.requiresCommunityGuidelines) {
            setDialogMode("guidelines");
            return;
        }

        toast({
            title: state.message,
        });

        if (state.message === "Verification request submitted successfully.") {
            setVerificationStatus("pending");
            setOpen(false);
            router.refresh();
            void onStatusChange?.();
            return;
        }

        if (state.message === "You already have a pending verification request.") {
            setVerificationStatus("pending");
            setOpen(false);
            void onStatusChange?.();
            return;
        }

        if (state.message === "Your account is already verified.") {
            setVerificationStatus("verified");
            setOpen(false);
            router.refresh();
            void onStatusChange?.();
        }
    }, [onStatusChange, router, state, toast]);

    if (user?.isVerified || verificationStatus === "verified") {
        return null;
    }

    const openVerificationDialog = () => {
        if (verificationStatus === "pending") {
            if (user?.handle) {
                router.push(`/circles/${user.handle}/settings/subscription`);
            }
            return;
        }

        const nextMode: DialogMode = !readiness.isReady
            ? "readiness"
            : communityGuidelinesCompleted
              ? "confirm"
              : "guidelines";

        console.log("[VerifyAccountButton] open", {
            nextMode,
            communityGuidelinesCompleted,
            communityGuidelinesAcceptance: user?.communityGuidelinesAcceptance,
            communityGuidelinesAcceptedAt: user?.communityGuidelinesAcceptedAt,
            userDid: user?.did,
        });

        setDialogMode(nextMode);
        setOpen(true);
    };

    const handleDialogChange = (nextOpen: boolean) => {
        setOpen(nextOpen);

        if (!nextOpen) {
            setDialogMode(readiness.isReady ? "confirm" : "readiness");
        }
    };

    const handleCodeOfConductComplete = async () => {
        console.log("[VerifyAccountButton] code of conduct completed", {
            communityGuidelinesCompleted: isCommunityGuidelinesCompleted(user?.communityGuidelinesAcceptance),
            communityGuidelinesAcceptance: user?.communityGuidelinesAcceptance,
            communityGuidelinesAcceptedAt: user?.communityGuidelinesAcceptedAt,
            userDid: user?.did,
        });

        setDialogMode("confirm");
        return { success: true };
    };

    return (
        <>
            <Button
                variant="default"
                className="bg-black text-white hover:bg-black/90"
                onClick={openVerificationDialog}
            >
                {verificationStatus === "pending" ? "Open Verification" : "Request Verification"}
            </Button>

            <Dialog open={open} onOpenChange={handleDialogChange}>
                <DialogContent
                    className={
                        activeDialogMode === "guidelines"
                            ? "max-h-[90vh] max-w-2xl overflow-y-auto border-none bg-transparent p-0 shadow-none"
                            : undefined
                    }
                >
                    {activeDialogMode === "guidelines" ? (
                        <CodeOfConductAgreement
                            user={user}
                            onUserChange={(nextUser) => setUser(nextUser)}
                            onComplete={handleCodeOfConductComplete}
                        />
                    ) : activeDialogMode === "readiness" ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>Complete your profile before requesting member verification.</DialogTitle>
                                <DialogDescription>
                                    Add the missing items below, then try again when your public profile is ready.
                                </DialogDescription>
                            </DialogHeader>
                            <VerificationReadinessChecklist readiness={readiness} />
                        </>
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle>Submit profile for review</DialogTitle>
                                <DialogDescription>
                                    Your profile will be submitted to Kamooni admins for review. You&apos;ll be
                                    notified when your verification request has been reviewed. Email verification is
                                    separate and only confirms your email address.
                                </DialogDescription>
                            </DialogHeader>

                            <form action={formAction}>
                                <DialogFooter>
                                    <Button
                                        type="submit"
                                        disabled={isSubmitting || !communityGuidelinesCompleted || !readiness.isReady}
                                    >
                                        {isSubmitting ? "Submitting..." : "Submit for review"}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
