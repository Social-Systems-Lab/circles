"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DiscussionForm from "@/components/modules/discussions/discussion-form";

interface CreateDiscussionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    circleHandle: string;
}

export default function CreateDiscussionDialog({ open, onOpenChange, circleHandle }: CreateDiscussionDialogProps) {
    const [refreshKey, setRefreshKey] = useState(0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="formatted">
                <DialogHeader>
                    <DialogTitle>Start a Discussion</DialogTitle>
                </DialogHeader>
                <DiscussionForm
                    key={refreshKey}
                    circleHandle={circleHandle}
                    onCreated={() => {
                        setRefreshKey((k) => k + 1);
                        onOpenChange(false);
                    }}
                />
            </DialogContent>
        </Dialog>
    );
}
