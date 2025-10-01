"use client";

import React, { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CircleWizard from "@/components/circle-wizard/circle-wizard";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { getUserPrivateAction } from "@/components/modules/home/actions";

interface CreateProjectDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (circleId?: string) => void;
}

export const CreateProjectDialog: React.FC<CreateProjectDialogProps> = ({ isOpen, onOpenChange, onSuccess }) => {
    const [user, setUser] = useAtom(userAtom);

    useEffect(() => {
        if (!isOpen) {
            // reset local state if needed in future
        }
    }, [isOpen]);

    const handleWizardComplete = async (createdCircleId?: string) => {
        onSuccess(createdCircleId);
        onOpenChange(false);
        const userData = await getUserPrivateAction();
        setUser(userData);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-[95vw] p-0 sm:max-w-[95vw] md:max-w-[800px] lg:max-w-[1000px]"
                onInteractOutside={(e) => {
                    e.preventDefault();
                }}
            >
                <div className="hidden">
                    <DialogHeader>
                        <DialogTitle>Create New Project</DialogTitle>
                    </DialogHeader>
                </div>
                <CircleWizard onComplete={handleWizardComplete} initialCircleType={"project"} />
            </DialogContent>
        </Dialog>
    );
};

export default CreateProjectDialog;
