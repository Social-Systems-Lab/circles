"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useState } from "react";
import CircleWizard from "./circle-wizard";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { DialogTitle, DialogHeader } from "@/components/ui/dialog";
import { useRouter, usePathname } from "next/navigation";

export function CreateCircleDialog({ parentCircleId }: { parentCircleId?: string }) {
    // parentCircleId removed from props
    const [isOpen, setIsOpen] = useState(false);
    const isCompact = useIsCompact();
    const router = useRouter();
    const pathname = usePathname();
    const isProjectsPage = pathname?.includes("/projects");
    const entityLabel = isProjectsPage ? "Project" : "Community";

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button
                    variant={isCompact ? "ghost" : "outline"}
                    className={isCompact ? "h-[32px] w-[32px] p-0" : "gap-2"}
                >
                    <Plus className="h-4 w-4" />
                    {isCompact ? "" : `Create ${entityLabel}`}
                </Button>
            </DialogTrigger>
            <DialogContent
                className="max-w-[95vw] p-0 sm:max-w-[95vw] md:max-w-[800px] lg:max-w-[1000px]"
                onInteractOutside={(e) => {
                    e.preventDefault();
                }}
            >
                <div className="hidden">
                    <DialogTitle>{`Create ${entityLabel}`}</DialogTitle>
                </div>
                <CircleWizard
                    initialCircleType={isProjectsPage ? "project" : "circle"}
                    initialParentCircleId={parentCircleId}
                    onComplete={(createdCircleId, handle) => {
                        setIsOpen(false);
                        if (handle) {
                            router.push(`/circles/${handle}`);
                        } else if (createdCircleId) {
                            router.push(`/circles/${createdCircleId}`);
                        }
                    }}
                />
            </DialogContent>
        </Dialog>
    );
}
