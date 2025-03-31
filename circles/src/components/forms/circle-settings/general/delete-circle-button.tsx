"use client";

import { useState } from "react";
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
import { deleteCircleAction } from "@/components/modules/circles/actions";

interface DeleteCircleButtonProps {
    circle: Circle;
}

export function DeleteCircleButton({ circle }: DeleteCircleButtonProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [confirmationText, setConfirmationText] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const router = useRouter();
    const { toast } = useToast();

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

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Circle</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. This will permanently delete the circle and all associated
                            data.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
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
