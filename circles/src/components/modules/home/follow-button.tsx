"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { userAtom } from "@/lib/data/atoms";
import { Circle } from "@/models/models";
import { useAtom } from "jotai";
import { usePathname, useRouter } from "next/navigation";
import { followCircle, leaveCircle, cancelFollowRequest } from "./actions";
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
    renderCompact?: boolean;
};

export const FollowButton = ({ circle, renderCompact }: CircleMembershipButtonProps) => {
    const [user, setUser] = useAtom(userAtom);
    const router = useRouter();
    const pathname = usePathname();
    const { toast } = useToast();
    const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
    const [isQuestionnaireOpen, setIsQuestionnaireOpen] = useState(false);
    const isCompact = useIsCompact();
    const isUserCircle = circle.circleType === "user";
    const compact = isCompact || renderCompact;

    const membershipStatus = useMemo(() => {
        if (!user) return "not-logged-in";
        const membership = user.memberships?.find((m) => m.circleId === circle._id);
        if (membership) return "member";
        const pendingRequest = user.pendingRequests?.find((r) => r.circleId === circle._id);
        if (pendingRequest) return "pending";
        return "not-member";
    }, [circle._id, user]);

    const onFollowCircleClick = async () => {
        if (!user) {
            router.push(`/login?redirect=${pathname}`);
            return;
        }

        if (circle.questionnaire && circle.questionnaire.length > 0) {
            setIsQuestionnaireOpen(true);
        } else {
            await processFollowRequest();
        }
    };

    const processFollowRequest = async (answers?: Record<string, string>) => {
        let result = await followCircle(circle, answers);
        if (result.success) {
            if (!result.pending) {
                toast({
                    icon: "success",
                    title: "Request Sent",
                    description: isUserCircle
                        ? `You are now following ${circle.name}.`
                        : `You are now following ${circle.name}.`,
                });
                setUser((prevUser) => ({
                    ...prevUser!,
                    memberships: [
                        ...(prevUser!.memberships || []),
                        { circleId: circle._id, circle: circle, userGroups: ["members"], joinedAt: new Date() },
                    ],
                }));
            } else {
                toast({
                    icon: "success",
                    title: "Request Sent",
                    description: isUserCircle
                        ? `Your request to follow ${circle.name} has been sent.`
                        : `Your request to follow ${circle.name} has been sent.`,
                });
                // Update user state to include the new pending request
                setUser((prevUser) => ({
                    ...prevUser!,
                    pendingRequests: [
                        ...(prevUser!.pendingRequests || []),
                        { circleId: circle._id, status: "pending", userDid: user!.did!, requestedAt: new Date() },
                    ],
                }));
            }
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
        processFollowRequest(answers);
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
                description: isUserCircle
                    ? `You've left ${circle.name} as friend`
                    : `You've left the circle ${circle.name}`,
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
        let result = await cancelFollowRequest(circle);
        if (result.success) {
            toast({
                icon: "success",
                title: "Request Cancelled",
                description: `Your request to follow ${circle.name} has been cancelled.`,
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

    if (circle._id === user?._id) {
        return null;
    }

    switch (membershipStatus) {
        case "member":
            return (
                <>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant={compact ? "ghost" : "outline"}
                                className={compact ? "h-[32px] w-[32px] p-0" : "rounded-full"}
                            >
                                {compact ? (
                                    <MoreVertical className="h-4 w-4" />
                                ) : (
                                    <>
                                        {isUserCircle ? "Friend" : "Member"} <ChevronDown className="ml-2 h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem onClick={handleLeaveCircleClick}>
                                {isUserCircle ? "Leave as Friend" : "Leave Circle"}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Dialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{isUserCircle ? "Leave as Friend" : "Leave Circle"}</DialogTitle>
                                <DialogDescription>
                                    {isUserCircle && (
                                        <>
                                            Are you sure you want to leave {circle.name} as friend? This action cannot
                                            be undone.
                                        </>
                                    )}
                                    {!isUserCircle && (
                                        <>
                                            `Are you sure you want to leave the circle {circle.name}? This action cannot
                                            be undone.
                                        </>
                                    )}
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsLeaveDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button variant="destructive" onClick={handleConfirmLeave}>
                                    {isUserCircle ? "Leave as Friend" : "Leave Circle"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                    {/* <pre>{JSON.stringify(user, null, 2)}</pre> */}
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
                    <Button
                        className={compact ? "w-[75px] rounded-full" : "w-[75px] rounded-full md:w-[150px]"}
                        size={compact ? "sm" : "default"}
                        onClick={onFollowCircleClick}
                    >
                        Follow
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

export default FollowButton;
