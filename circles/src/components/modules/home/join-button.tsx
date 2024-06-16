"use client";

import { Button } from "@/components/ui/button";
import { userAtom } from "@/lib/data/atoms";
import { Circle } from "@/models/models";
import { useAtom } from "jotai";
import { usePathname, useRouter } from "next/navigation";
import React, { useMemo, useState } from "react";
import { joinCircle } from "./actions";
import { useToast } from "@/components/ui/use-toast";

type JoinButtonProps = {
    circle: Circle;
};

export const JoinButton = ({ circle }: JoinButtonProps) => {
    const [user, setUser] = useAtom(userAtom);

    const router = useRouter();
    const pathname = usePathname();
    const { toast } = useToast();

    // const isMember = useMemo(() => {
    //     if (!user) return false;
    //     return user.circles.find((c) => c._id === circle._id);
    // }, [circle?._id, user?.did]);

    const onJoinCircleClick = async () => {
        if (!user) {
            // redirect to login
            router.push(`/login?redirect=${pathname}`);
            return;
        }

        // call server action to join circle
        let result = await joinCircle(circle);
        if (result.success) {
            toast({
                icon: "success",
                title: "Joined",
                description: `You've joined the circle ${circle.name}`,
            });
        } else {
            toast({
                icon: "error",
                title: "Error",
                description: result.message,
                variant: "destructive",
            });
        }

        console.log(result);
    };

    return (
        <div className="flex flex-col">
            <Button className="h-[34px] w-[100px] rounded-full bg-black font-bold" onClick={onJoinCircleClick}>
                Join
            </Button>
            {/* {JSON.stringify(user)} */}
        </div>
    );
};

export default JoinButton;
