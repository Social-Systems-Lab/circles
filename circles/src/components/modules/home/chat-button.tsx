"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { Circle } from "@/models/models";
import { useIsCompact } from "@/components/utils/use-is-compact";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { contactCircleAdminsAction } from "@/components/modules/chat/mongo-actions";

interface ChatButtonProps {
    circle: Circle;
    renderCompact?: boolean;
}

const ChatButton: React.FC<ChatButtonProps> = ({ circle, renderCompact }) => {
    const router = useRouter();
    const isCompact = useIsCompact();
    const compact = isCompact || renderCompact;
    const { toast } = useToast();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [contactMessage, setContactMessage] = useState("");
    const [contactError, setContactError] = useState("");
    const [isSending, setIsSending] = useState(false);

    const closeDialog = (open: boolean) => {
        setIsDialogOpen(open);
        if (!open) {
            setContactMessage("");
            setContactError("");
        }
    };

    const handleClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDialogOpen(true);
    };

    const sendMessage = async () => {
        const trimmedMessage = contactMessage.trim();
        if (!trimmedMessage) {
            setContactError("Message is required.");
            return;
        }

        setIsSending(true);
        setContactError("");

        try {
            const result = await contactCircleAdminsAction(String(circle._id || ""), trimmedMessage);
            if (!result.success || !result.roomId) {
                setContactError(result.message || "Could not start the conversation.");
                return;
            }

            setContactMessage("");
            setIsDialogOpen(false);
            router.push(`/chat/${result.roomId}`);
        } catch (error) {
            console.error("Failed to contact circle admins:", error);
            toast({
                title: "Could not send message",
                description: "Please try again.",
                variant: "destructive",
                icon: "error",
            });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <>
            <Button
                onClick={handleClick}
                variant={compact ? "ghost" : "outline"}
                className={compact ? "h-[32px] w-[32px] p-0" : "gap-2 rounded-full"}
            >
                <MessageCircle className="h-4 w-4" />
                {compact ? "" : "Message"}
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={closeDialog}>
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle>Message {circle.name || "this circle"}</DialogTitle>
                        <DialogDescription>
                            Your message will create a shared thread with this circle&apos;s admins.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Textarea
                            value={contactMessage}
                            onChange={(event) => {
                                setContactMessage(event.target.value);
                                if (contactError) {
                                    setContactError("");
                                }
                            }}
                            rows={5}
                            placeholder="Write a short message to this circle's admins..."
                        />
                        {contactError && <p className="text-sm text-destructive">{contactError}</p>}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => closeDialog(false)} disabled={isSending}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={sendMessage} disabled={isSending || !contactMessage.trim()}>
                            {isSending ? "Sending..." : "Send Message"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default ChatButton;
