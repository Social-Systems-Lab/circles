"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useState } from "react";
import CircleWizard from "./circle-wizard";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { DialogTitle, DialogHeader } from "@/components/ui/dialog";

export function CreateCircleDialog() {
    // parentCircleId removed from props
    const [isOpen, setIsOpen] = useState(false);
    const isCompact = useIsCompact();

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button
                    variant={isCompact ? "ghost" : "outline"}
                    className={isCompact ? "h-[32px] w-[32px] p-0" : "gap-2"}
                >
                    <Plus className="h-4 w-4" />
                    {isCompact ? "" : `Create Community`}
                </Button>
            </DialogTrigger>
            <DialogContent
                className="max-w-[95vw] p-0 sm:max-w-[95vw] md:max-w-[800px] lg:max-w-[1000px]"
                onInteractOutside={(e) => {
                    e.preventDefault();
                }}
            >
                <div className="hidden">
                    <DialogTitle>{`Create Community`}</DialogTitle>
                </div>
                <CircleWizard
                    // parentCircleId={parentCircleId} // Removed
                    onComplete={() => setIsOpen(false)} // This is compatible, createdCircleId will be ignored
                />
            </DialogContent>
        </Dialog>
    );
}
