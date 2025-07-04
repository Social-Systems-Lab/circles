"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Circle } from "@/models/models";
import { useAtom } from "jotai";
import { mapOpenAtom } from "@/lib/data/atoms";
import { useIsCompact } from "@/components/utils/use-is-compact";

interface InviteButtonProps {
    circle: Circle;
    renderCompact?: boolean;
}

const InviteButton: React.FC<InviteButtonProps> = ({ circle, renderCompact }) => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const isCompact = useIsCompact();
    const { toast } = useToast();
    const isUser = circle?.circleType === "user";
    const compact = isCompact || renderCompact;

    const getCirclePagePath = (circle: Circle, pageHandle: string, absolutePath: boolean): string => {
        if (typeof window === "undefined") {
            return "";
        }

        let rootPath = absolutePath ? window.location.origin : "";
        return `${rootPath}/circles/${circle.handle}${pageHandle ? `/${pageHandle}` : ""}`;
    };

    const inviteLink = getCirclePagePath(circle, "", true);

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(inviteLink);
            toast({
                title: "Link copied",
                description: "Invite link has been copied to clipboard",
            });
        } catch (err) {
            toast({
                title: "Failed to copy",
                description: "An error occurred while copying the link",
                variant: "destructive",
            });
        }
    };

    // if (isCompact) {
    //     return null;
    // }

    return (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                <Button
                    variant={compact ? "ghost" : "outline"}
                    className={compact ? "h-[32px] w-[32px] p-0" : "gap-2 rounded-full"}
                >
                    <UserPlus className="h-4 w-4" />
                    {compact ? "" : "Invite"}
                </Button>
            </DialogTrigger>
            <DialogContent
                className="sm:max-w-md"
                onInteractOutside={(e) => {
                    e.preventDefault();
                }}
            >
                <DialogHeader>
                    <DialogTitle>{isUser ? "Invite people to the user" : "Invite people to the circle"}</DialogTitle>
                    <DialogDescription>
                        {isUser
                            ? "Anyone with this link can request to follow the user."
                            : "Anyone with this link can request to follow the circle."}
                    </DialogDescription>
                </DialogHeader>
                <div className="flex items-center space-x-2">
                    <Input className="flex-1" value={inviteLink} readOnly />
                    <Button type="submit" onClick={copyToClipboard}>
                        Copy
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default InviteButton;
