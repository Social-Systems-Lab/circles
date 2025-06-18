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
import { requestVerification } from "@/lib/actions/verification";
import { useActionState, useEffect, useState } from "react";
import { useToast } from "@/components/ui/use-toast";

export function VerifyAccountButton() {
    const [state, formAction] = useActionState(requestVerification, { message: "" });
    const [open, setOpen] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        if (state.message) {
            toast({
                title: state.message,
            });
            setOpen(false);
        }
    }, [state, toast]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">Verify Account</Button>
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
