"use client";

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
import { useActionState, useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { requestVerification, getVerificationStatus } from "./actions";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { useRouter } from "next/navigation";

export function VerifyAccountButton() {
    const [user] = useAtom(userAtom);
    const [state, formAction] = useActionState(requestVerification, { message: "" });
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const [verificationStatus, setVerificationStatus] = useState<"verified" | "pending" | "unverified">("unverified");
    const router = useRouter();

    useEffect(() => {
        const fetchStatus = async () => {
            const status = await getVerificationStatus();
            setVerificationStatus(status);
        };
        fetchStatus();
    }, []);

    useEffect(() => {
        if (state.message) {
            toast({
                title: state.message,
            });
            setOpen(false);
            if (state.message === "Verification request submitted successfully.") {
                setVerificationStatus("pending");
            }
        }
    }, [state, toast]);

    if (user?.isVerified) {
        return null; // User is already verified, no button needed
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

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" disabled={verificationStatus === "pending"}>
                    {verificationStatus === "pending" ? "Pending Approval" : "Verify Account"}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Request Account Verification</DialogTitle>
                    <DialogDescription>
                        {`By clicking 'Confirm,' you will send a request to the administrators to verify your account.
                        Please ensure your profile is complete to increase your chances of approval.`}
                    </DialogDescription>
                    <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                        <p>
                            You can also support the platform and get a founding member badge by becoming a member.
                            Members are automatically verified.
                        </p>
                        <Button variant="link" className="p-0 text-yellow-800" onClick={handleLearnMore}>
                            Learn more about membership
                        </Button>
                    </div>
                </DialogHeader>
                <DialogFooter>
                    <form action={formAction}>
                        <Button type="submit">Confirm</Button>
                    </form>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
