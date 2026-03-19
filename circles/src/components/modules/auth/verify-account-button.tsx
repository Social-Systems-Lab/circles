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
import { requestVerification, getVerificationStatus } from "./actions";

type DialogMode = "guidelines" | "confirm";

export function VerifyAccountButton() {
    const [user, setUser] = useAtom(userAtom);
    const [state, formAction, isSubmitting] = useActionState(requestVerification, { message: "" });
    const [open, setOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<DialogMode>("confirm");
    const { toast } = useToast();
    const [verificationStatus, setVerificationStatus] = useState<"verified" | "pending" | "unverified">("unverified");
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
            return;
        }

        if (state.message === "You already have a pending verification request.") {
            setVerificationStatus("pending");
            setOpen(false);
            return;
        }

        if (state.message === "Your account is already verified.") {
            setVerificationStatus("verified");
            setOpen(false);
        }
    }, [state, toast]);

    if (user?.isVerified) {
        return null;
    }

    if (verificationStatus === "verified") {
        return null;
    }

    const handleLearnMore = () => {
        if (user) {
            router.push(`/circles/${user.handle}/settings/subscription`);
            setOpen(false);
        }
    };

    const openVerificationDialog = () => {
        setDialogMode(communityGuidelinesCompleted ? "confirm" : "guidelines");
        setOpen(true);
    };

    return (
        <>
            <Button variant="outline" disabled={verificationStatus === "pending"} onClick={openVerificationDialog}>
                {verificationStatus === "pending" ? "Pending Approval" : "Verify Account"}
            </Button>

            <Dialog
                open={open}
                onOpenChange={(nextOpen) => {
                    setOpen(nextOpen);
                    if (!nextOpen) {
                        setDialogMode("confirm");
                    }
                }}
            >
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
                            onComplete={async () => {
                                setDialogMode("confirm");
                                return { success: true };
                            }}
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
                            <DialogFooter>
                                <form action={formAction}>
                                    <Button type="submit" disabled={isSubmitting || !communityGuidelinesCompleted}>
                                        {isSubmitting ? "Submitting..." : "Confirm"}
                                    </Button>
                                </form>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
