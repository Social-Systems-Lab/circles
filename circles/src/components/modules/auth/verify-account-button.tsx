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

export function VerifyAccountButton() {
    const [state, formAction] = useActionState(requestVerification, { message: "" });
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const [verificationStatus, setVerificationStatus] = useState<"verified" | "pending" | "unverified">("unverified");

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

    if (verificationStatus === "verified") {
        return null;
    }

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
