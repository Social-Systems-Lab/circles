"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { convertProfileChildCircleToIndependentAction } from "./actions";

type ConvertProfileChildCircleCardProps = {
    circleId: string;
    parentCircleName: string;
};

export function ConvertProfileChildCircleCard({
    circleId,
    parentCircleName,
}: ConvertProfileChildCircleCardProps): React.ReactElement {
    const router = useRouter();
    const { toast } = useToast();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleConvert = async () => {
        setIsSubmitting(true);
        try {
            const result = await convertProfileChildCircleToIndependentAction(circleId);
            if (!result.success) {
                toast({
                    title: "Error",
                    description: result.message || "Failed to convert circle",
                    variant: "destructive",
                });
                return;
            }

            toast({
                title: "Success",
                description: result.message || "Circle converted successfully",
            });
            setDialogOpen(false);
            if (result.data?.redirectTo) {
                router.push(result.data.redirectTo);
            } else {
                router.refresh();
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "An unexpected error occurred while converting the circle.",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
            <div className="space-y-3">
                <div className="space-y-1">
                    <h2 className="text-base font-semibold text-amber-900">Make this an independent circle</h2>
                    <p className="text-sm text-amber-800">
                        This circle currently sits under the personal/profile circle {parentCircleName}.
                    </p>
                    <p className="text-sm text-amber-800">
                        Converting it will make this circle independent. It will no longer sit under the
                        personal/profile circle. Existing child circles will remain attached. Existing members and
                        content will remain.
                    </p>
                </div>

                <Button variant="outline" onClick={() => setDialogOpen(true)}>
                    Convert to independent circle
                </Button>
            </div>

            <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Convert this circle?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This circle will become an independent circle. It will no longer sit under the
                            personal/profile circle. Existing child circles will remain attached. Existing members and
                            content will remain.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConvert} disabled={isSubmitting}>
                            {isSubmitting ? "Converting..." : "Convert circle"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
