"use client";

import { useActionState, useEffect, useState } from "react";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { CommunityGuidelinesAgreementFlow } from "@/components/auth/community-guidelines-gate";
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
import { getVerificationStatus, requestVerification, RequestVerificationResult } from "./actions";

type DialogMode = "guidelines" | "confirm";

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

    const communityGuidelinesCompleted = isCommunityGuidelinesCompleted(user?.communityGuidelinesAcceptance);
    const activeDialogMode: DialogMode = communityGuidelinesCompleted ? dialogMode : "guidelines";

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

        const nextMode: DialogMode = communityGuidelinesCompleted ? "confirm" : "guidelines";

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
            setDialogMode("confirm");
        }
    };

    const handleLearnMore = () => {
        if (!user) {
            return;
        }

        router.push(`/circles/${user.handle}/settings/subscription`);
        setOpen(false);
    };

    const handleGuidelinesComplete = async () => {
        console.log("[VerifyAccountButton] guidelines completed", {
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
                {verificationStatus === "pending" ? "Open Verification" : "Verify Account"}
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
                        <CommunityGuidelinesAgreementFlow
                            user={user}
                            onUserChange={(nextUser) => setUser(nextUser)}
                            onComplete={handleGuidelinesComplete}
                        />
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle>Request Account Verification</DialogTitle>
                                <DialogDescription>
                                    {`By clicking 'Confirm,' you will send a request to the administrators to verify your account.
                        Please ensure your profile is complete to increase your chances of approval.`}
                                </DialogDescription>
                                <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                                    <p>
                                        You can also support the platform and get a founding member badge by becoming a
                                        member. Members are automatically verified.
                                    </p>
                                    <Button variant="link" className="p-0 text-yellow-800" onClick={handleLearnMore}>
                                        Learn more about membership
                                    </Button>
                                </div>
                            </DialogHeader>

                            <form action={formAction}>
                                <DialogFooter>
                                    <Button type="submit" disabled={isSubmitting || !communityGuidelinesCompleted}>
                                        {isSubmitting ? "Submitting..." : "Confirm"}
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
