"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { userAtom } from "@/lib/data/atoms";
import { Circle, MembershipRequest } from "@/models/models";
import { useAtom } from "jotai";
import { usePathname, useRouter } from "next/navigation";
import { joinCircle, leaveCircle, cancelJoinRequest } from "./actions";
import { useToast } from "@/components/ui/use-toast";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, MoreVertical } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { CircleQuestionnaireDialog } from "./questionnaire-dialog";

type CircleMembershipButtonProps = {
    circle: Circle;
};

export const CircleMembershipButton = ({ circle }: CircleMembershipButtonProps) => {
    const [user, setUser] = useAtom(userAtom);
    const router = useRouter();
    const pathname = usePathname();
    const { toast } = useToast();
    const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
    const [isQuestionnaireOpen, setIsQuestionnaireOpen] = useState(false);
    const isCompact = useIsCompact();

    const membershipStatus = useMemo(() => {
        if (!user) return "not-logged-in";
        const membership = user.memberships?.find((m) => m.circleId === circle._id);
        if (membership) return "member";
        const pendingRequest = user.pendingRequests?.find((r) => r.circleId === circle._id);
        if (pendingRequest) return "pending";
        return "not-member";
    }, [circle._id, user]);

    const onJoinCircleClick = async () => {
        if (!user) {
            router.push(`/login?redirect=${pathname}`);
            return;
        }

        if (circle.questionnaire && circle.questionnaire.length > 0) {
            setIsQuestionnaireOpen(true);
        } else {
            await processJoinRequest();
        }
    };

    const processJoinRequest = async (answers?: Record<string, string>) => {
        let result = await joinCircle(circle, answers);
        if (result.success) {
            toast({
                icon: "success",
                title: "Request Sent",
                description: `Your request to join ${circle.name} has been sent.`,
            });
            // Update user state to include the new pending request
            setUser((prevUser) => ({
                ...prevUser!,
                pendingRequests: [
                    ...(prevUser!.pendingRequests || []),
                    { circleId: circle._id, status: "pending", userDid: user!.did, requestedAt: new Date() },
                ],
            }));
        } else {
            toast({
                icon: "error",
                title: "Error",
                description: result.message,
                variant: "destructive",
            });
        }
    };

    const onQuestionnaireSubmit = (answers: Record<string, string>) => {
        setIsQuestionnaireOpen(false);
        processJoinRequest(answers);
    };

    const handleLeaveCircleClick = () => {
        setIsLeaveDialogOpen(true);
    };

    const handleConfirmLeave = async () => {
        setIsLeaveDialogOpen(false);
        let result = await leaveCircle(circle);
        if (result.success) {
            toast({
                icon: "success",
                title: "Left Circle",
                description: `You've left the circle ${circle.name}`,
            });
            // Update user state to remove the membership
            setUser((prevUser) => ({
                ...prevUser!,
                memberships: prevUser!.memberships.filter((m) => m.circleId !== circle._id),
            }));
        } else {
            toast({
                icon: "error",
                title: "Error",
                description: result.message,
                variant: "destructive",
            });
        }
    };

    const onCancelRequestClick = async () => {
        let result = await cancelJoinRequest(circle);
        if (result.success) {
            toast({
                icon: "success",
                title: "Request Cancelled",
                description: `Your request to join ${circle.name} has been cancelled.`,
            });
            // Update user state to remove the pending request
            setUser((prevUser) => ({
                ...prevUser!,
                pendingRequests: prevUser!.pendingRequests?.filter((r) => r.circleId !== circle._id) || [],
            }));
        } else {
            toast({
                icon: "error",
                title: "Error",
                description: result.message,
                variant: "destructive",
            });
        }
    };

    switch (membershipStatus) {
        case "member":
            return (
                <>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant={isCompact ? "ghost" : "outline"}
                                className={isCompact ? "h-[32px] w-[32px] p-0" : "rounded-full"}
                            >
                                {isCompact ? (
                                    <MoreVertical className="h-4 w-4" />
                                ) : (
                                    <>
                                        Member <ChevronDown className="ml-2 h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem onClick={handleLeaveCircleClick}>Leave Circle</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Dialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Leave Circle</DialogTitle>
                                <DialogDescription>
                                    Are you sure you want to leave the circle "{circle.name}"? This action cannot be
                                    undone.
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsLeaveDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button variant="destructive" onClick={handleConfirmLeave}>
                                    Leave Circle
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </>
            );
        case "pending":
            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="rounded-full">
                            Pending <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onClick={onCancelRequestClick}>Cancel Request</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            );
        case "not-member":
        case "not-logged-in":
        default:
            return (
                <>
                    <Button className="w-[100px] rounded-full md:w-[150px]" onClick={onJoinCircleClick}>
                        {isCompact ? "Join" : "Join Circle"}
                    </Button>
                    <CircleQuestionnaireDialog
                        isOpen={isQuestionnaireOpen}
                        onClose={() => setIsQuestionnaireOpen(false)}
                        onSubmit={onQuestionnaireSubmit}
                        questions={circle.questionnaire || []}
                    />
                </>
            );
    }
};

export default CircleMembershipButton;
