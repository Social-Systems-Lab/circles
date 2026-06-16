"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { publishManagedPeerifyIdentityAction } from "@/app/profiles/actions";

type PublishManagedProfileButtonProps = {
    circleId: string;
    label?: string;
    size?: "default" | "sm";
    className?: string;
};

export function PublishManagedProfileButton({
    circleId,
    label = "Publish profile",
    size = "sm",
    className,
}: PublishManagedProfileButtonProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [isPending, startTransition] = React.useTransition();

    const publishProfile = () => {
        startTransition(async () => {
            const result = await publishManagedPeerifyIdentityAction(circleId);
            toast({
                title: result.success ? "Profile published" : "Could not publish profile",
                description: result.message,
                variant: result.success ? "default" : "destructive",
                icon: result.success ? "success" : "error",
            });

            if (result.success) {
                router.refresh();
            }
        });
    };

    return (
        <Button type="button" size={size} className={className} onClick={publishProfile} disabled={isPending}>
            {isPending ? "Publishing..." : label}
        </Button>
    );
}
