"use client";

import React, { useState, useTransition } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import { rsvpEventWithOptionsAction } from "@/app/circles/[handle]/events/actions";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    circleHandle: string;
    eventId: string;
};

export default function RsvpDialog({ open, onOpenChange, circleHandle, eventId }: Props) {
    const { toast } = useToast();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [isPublic, setIsPublic] = useState<boolean>(true);
    const [message, setMessage] = useState<string>("");

    const onConfirm = () => {
        startTransition(async () => {
            const res = await rsvpEventWithOptionsAction(circleHandle, eventId, "going", {
                isPublic,
                message: isPublic ? message?.trim() || undefined : undefined,
            });
            if (res.success) {
                toast({ title: "RSVP updated" });
                onOpenChange(false);
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: res.message || "Failed to RSVP",
                    variant: "destructive",
                });
            }
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[525px]">
                <DialogHeader>
                    <DialogTitle>RSVP: I&apos;m going</DialogTitle>
                    <DialogDescription>
                        Add an optional message and choose if you want to appear publicly in the participants list.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {isPublic && (
                        <div className="space-y-2">
                            <Label htmlFor="rsvp-message">Public message (optional)</Label>
                            <Textarea
                                id="rsvp-message"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Add a short note…"
                                maxLength={500}
                                className="min-h-[90px]"
                            />
                            <div className="text-right text-xs text-muted-foreground">{message.length}/500</div>
                        </div>
                    )}

                    <div className="flex items-center justify-between rounded-md border p-3">
                        <div className="flex flex-col">
                            <Label htmlFor="rsvp-public">Show me publicly</Label>
                            <span className="text-sm text-muted-foreground">
                                If disabled, you will still be counted as an attendee but won&apos;t appear in the
                                public list.
                            </span>
                        </div>
                        <Switch
                            id="rsvp-public"
                            checked={isPublic}
                            onCheckedChange={(v) => {
                                setIsPublic(v);
                                if (!v) setMessage("");
                            }}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button onClick={onConfirm} disabled={isPending}>
                        {isPending ? "Saving…" : "Confirm"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
