"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { Circle } from "@/models/models";
import { deleteCircleAction, getCircleDeletionStatsAction } from "@/components/modules/circles/actions";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { getUserPrivateAction } from "@/components/modules/home/actions";

interface DeleteCircleButtonProps {
    circle: Circle;
}

export function DeleteCircleButton({ circle }: DeleteCircleButtonProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [confirmationText, setConfirmationText] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLoadingStats, setIsLoadingStats] = useState(false);
    const [deletionStats, setDeletionStats] = useState<{
        membersCount: number;
        feedsCount: number;
        postsCount: number;
        isUser: boolean;
    } | null>(null);
    const router = useRouter();
    const { toast } = useToast();
    const [user, setUser] = useAtom(userAtom);

    // Fetch deletion stats when dialog opens
    useEffect(() => {
        if (isDialogOpen && !deletionStats) {
            const fetchStats = async () => {
                setIsLoadingStats(true);
                try {
                    const result = await getCircleDeletionStatsAction(circle._id!);
                    if (result.success && result.stats) {
                        setDeletionStats(result.stats);
                    } else {
                        toast({
                            title: "Error",
                            description: result.message || "Failed to fetch deletion statistics",
                            variant: "destructive",
                        });
                    }
                } catch (error) {
                    console.error("Error fetching deletion stats:", error);
                } finally {
                    setIsLoadingStats(false);
                }
            };
            fetchStats();
        }
    }, [isDialogOpen, circle._id, deletionStats, toast]);

    const handleDelete = async () => {
        if (confirmationText !== circle.name) {
            toast({
                title: "Error",
                description: "The confirmation text does not match the circle name.",
                variant: "destructive",
            });
            return;
        }

        setIsDeleting(true);

        try {
            const result = await deleteCircleAction(circle._id!, confirmationText);

            if (result.success) {
                toast({
                    title: "Success",
                    description: result.message,
                });

                // Update user atom by removing the membership for this circle
                if (user && user.memberships) {
                    // Option 1: Update the user atom directly by filtering out the deleted circle
                    const updatedMemberships = user.memberships.filter(
                        (membership) => membership.circleId !== circle._id,
                    );
                    setUser({ ...user, memberships: updatedMemberships });
                }

                // Redirect to circles page
                if (result.data?.redirectTo) {
                    router.push(result.data.redirectTo);
                }
            } else {
                toast({
                    title: "Error",
                    description: result.message,
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "An unexpected error occurred while deleting the circle.",
                variant: "destructive",
            });
            console.error("Error deleting circle:", error);
        } finally {
            setIsDeleting(false);
            setIsDialogOpen(false);
        }
    };

    return (
        <div className="mt-6 border-t border-red-200 pt-6">
            <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <Trash2 className="h-5 w-5 text-red-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">Delete Circle</h3>
                        <div className="mt-2 text-sm text-red-700">
                            <p>
                                Once you delete a circle, there is no going back. This action permanently deletes the
                                circle and all associated data.
                            </p>
                        </div>
                        <div className="mt-4">
                            <Button variant="destructive" onClick={() => setIsDialogOpen(true)}>
                                Delete Circle
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <Dialog
                open={isDialogOpen}
                onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) {
                        setDeletionStats(null);
                        setConfirmationText("");
                    }
                }}
            >
                <DialogContent
                    className="sm:max-w-md"
                    onInteractOutside={(e) => {
                        e.preventDefault();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Delete Circle</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. This will permanently delete the circle and all associated
                            data.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {isLoadingStats ? (
                            <div className="py-4 text-center">
                                <p className="text-sm text-gray-500">Loading deletion information...</p>
                            </div>
                        ) : deletionStats ? (
                            <div className="mb-6 rounded-md bg-red-50 p-3">
                                <h4 className="mb-2 text-sm font-medium text-red-800">
                                    The following will be deleted:
                                </h4>
                                <ul className="list-disc space-y-1 pl-5 text-sm text-red-700">
                                    <li>{deletionStats.membersCount} followers</li>
                                    <li>{deletionStats.feedsCount} feeds</li>
                                    <li>{deletionStats.postsCount} posts</li>
                                    {deletionStats.isUser && (
                                        <li>
                                            <strong>User account</strong> and associated files
                                        </li>
                                    )}
                                </ul>
                            </div>
                        ) : null}

                        <p className="mb-4 text-sm text-gray-500">
                            To confirm, please type the name of the circle: <strong>{circle.name}</strong>
                        </p>
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="confirmation">Confirmation</Label>
                                <Input
                                    id="confirmation"
                                    value={confirmationText}
                                    onChange={(e) => setConfirmationText(e.target.value)}
                                    placeholder="Enter circle name"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isDeleting}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={isDeleting || confirmationText !== circle.name}
                        >
                            {isDeleting ? "Deleting..." : "Delete Circle"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
