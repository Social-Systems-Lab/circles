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
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { isCommunityGuidelinesCompleted } from "@/lib/community-guidelines";
import { userAtom } from "@/lib/data/atoms";
import { saveDonationIntentAction } from "@/components/onboarding/actions";
import { cn } from "@/lib/utils";
import { getVerificationReadiness } from "@/lib/verification-readiness";
import { VerificationReadinessChecklist } from "@/components/modules/verification/verification-readiness-checklist";
import { getVerificationStatus, requestVerification, RequestVerificationResult } from "./actions";

type DialogMode = "readiness" | "guidelines" | "confirm";
type SupporterAmount = "1" | "2" | "5" | "10" | "other" | null;

const INITIAL_REQUEST_STATE: RequestVerificationResult = {
    message: "",
};
const SUPPORTER_OPTIONS: Array<{ amount: Exclude<SupporterAmount, "other" | null> }> = [
    { amount: "1" },
    { amount: "2" },
    { amount: "5" },
    { amount: "10" },
];

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
    const [supporterAmount, setSupporterAmount] = useState<SupporterAmount>(null);
    const [customSupporterAmount, setCustomSupporterAmount] = useState("");
    const [supporterSkipped, setSupporterSkipped] = useState(false);
    const [isSavingSupporterIntent, setIsSavingSupporterIntent] = useState(false);
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
            setSupporterAmount(null);
            setCustomSupporterAmount("");
            setSupporterSkipped(false);
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

    const saveSupporterIntent = async (nextAmount: SupporterAmount, nextCustomAmount: string, skipped: boolean) => {
        setIsSavingSupporterIntent(true);
        try {
            const result = await saveDonationIntentAction({
                amount: nextAmount === "other" ? null : nextAmount,
                customAmount: nextAmount === "other" ? nextCustomAmount : "",
                volunteering: false,
                skipped,
            });

            if (!result.success) {
                toast({
                    title: "Could not save your support preference",
                    description: result.message,
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Could not save your support preference",
                description: error instanceof Error ? error.message : "An unexpected error occurred.",
                variant: "destructive",
            });
        } finally {
            setIsSavingSupporterIntent(false);
        }
    };

    const handleSupporterAmountSelect = async (amount: Exclude<SupporterAmount, null>) => {
        setSupporterAmount(amount);
        setSupporterSkipped(false);
        if (amount !== "other") {
            setCustomSupporterAmount("");
            await saveSupporterIntent(amount, "", false);
        }
    };

    const handleMaybeLater = async () => {
        setSupporterAmount(null);
        setCustomSupporterAmount("");
        setSupporterSkipped(true);
        await saveSupporterIntent(null, "", true);
    };

    const handleCustomSupporterBlur = async () => {
        const trimmedValue = customSupporterAmount.trim();
        if (!trimmedValue || supporterAmount !== "other") {
            return;
        }

        await saveSupporterIntent("other", trimmedValue, false);
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
                                    Your profile will be submitted to Peerify admins for review. You&apos;ll be
                                    notified when your verification request has been reviewed. Email verification is
                                    separate and only confirms your email address.
                                </DialogDescription>
                            </DialogHeader>

                            <form action={formAction}>
                                <div className="space-y-3 rounded-lg border border-[#eadcc0] bg-[#fff9ef] p-4">
                                    <div className="space-y-1">
                                        <div className="text-sm font-medium text-foreground">
                                            Peerify is community-supported. Would you consider becoming a Founding
                                            Supporter from €1/month?
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Optional. Your profile review request will still be submitted either way.
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {SUPPORTER_OPTIONS.map((option) => {
                                            const selected = supporterAmount === option.amount && !supporterSkipped;
                                            return (
                                                <button
                                                    key={option.amount}
                                                    type="button"
                                                    onClick={() => void handleSupporterAmountSelect(option.amount)}
                                                    className={cn(
                                                        "rounded-full border px-3 py-1.5 text-sm transition-colors",
                                                        selected
                                                            ? "border-[#c77733] bg-[#c77733] text-white"
                                                            : "border-[#d8c7a0] bg-white text-kam-gray-dark hover:border-[#c77733]/60",
                                                    )}
                                                    disabled={isSavingSupporterIntent}
                                                >
                                                    €{option.amount}
                                                </button>
                                            );
                                        })}

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSupporterSkipped(false);
                                                setSupporterAmount("other");
                                            }}
                                            className={cn(
                                                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                                                supporterAmount === "other" && !supporterSkipped
                                                    ? "border-[#c77733] bg-[#c77733] text-white"
                                                    : "border-[#d8c7a0] bg-white text-kam-gray-dark hover:border-[#c77733]/60",
                                            )}
                                            disabled={isSavingSupporterIntent}
                                        >
                                            Own amount
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => void handleMaybeLater()}
                                            className={cn(
                                                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                                                supporterSkipped
                                                    ? "border-[#c77733] bg-[#c77733] text-white"
                                                    : "border-[#d8c7a0] bg-white text-kam-gray-dark hover:border-[#8b6f47]/60",
                                            )}
                                            disabled={isSavingSupporterIntent}
                                        >
                                            Maybe later
                                        </button>
                                    </div>

                                    {supporterAmount === "other" ? (
                                        <div className="max-w-[180px]">
                                            <Input
                                                inputMode="decimal"
                                                placeholder="Amount in €"
                                                value={customSupporterAmount}
                                                onChange={(event) => setCustomSupporterAmount(event.target.value)}
                                                onBlur={() => void handleCustomSupporterBlur()}
                                                className="h-9 border-[#d9c7a0] bg-white"
                                            />
                                        </div>
                                    ) : null}
                                </div>

                                <DialogFooter>
                                    <Button
                                        type="submit"
                                        disabled={
                                            isSubmitting ||
                                            isSavingSupporterIntent ||
                                            !communityGuidelinesCompleted ||
                                            !readiness.isReady
                                        }
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
