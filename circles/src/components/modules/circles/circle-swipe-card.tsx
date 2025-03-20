"use client";

import React, { useState } from "react";
import { motion, PanInfo, useAnimation } from "framer-motion";
import { Circle, WithMetric } from "@/models/models";
import Image from "next/image";
import { CirclePicture } from "./circle-picture";
import CircleTags from "./circle-tags";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { followCircle } from "../home/actions";
import { useToast } from "@/components/ui/use-toast";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { ignoreCircle } from "../home/ignore-actions";

interface CircleSwipeCardProps {
    circle: WithMetric<Circle>;
    onSwiped: (circle: Circle, direction: "left" | "right") => void;
    zIndex: number;
}

export const CircleSwipeCard: React.FC<CircleSwipeCardProps> = ({ circle, onSwiped, zIndex }) => {
    const controls = useAnimation();
    const [exitX, setExitX] = useState(0);
    const router = useRouter();
    const { toast } = useToast();
    const [user, setUser] = useAtom(userAtom);

    const handleDragEnd = async (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        const threshold = 100;

        if (info.offset.x > threshold) {
            // Swiped right - follow
            setExitX(200);
            await controls.start({ x: 200, opacity: 0 });
            onSwiped(circle, "right");
            await processFollowRequest();
        } else if (info.offset.x < -threshold) {
            // Swiped left - ignore
            setExitX(-200);
            await controls.start({ x: -200, opacity: 0 });
            onSwiped(circle, "left");
            await processIgnoreRequest();
        } else {
            // Return to center if not beyond threshold
            controls.start({ x: 0, opacity: 1 });
        }
    };

    const processFollowRequest = async () => {
        if (!user) {
            router.push("/login");
            return;
        }

        let result = await followCircle(circle);
        if (result.success) {
            if (!result.pending) {
                toast({
                    icon: "success",
                    title: "Following",
                    description: `You are now following ${circle.name}.`,
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
                    description: `Your request to follow ${circle.name} has been sent.`,
                });
                setUser((prevUser) => ({
                    ...prevUser!,
                    pendingRequests: [
                        ...(prevUser!.pendingRequests || []),
                        { circleId: circle._id, status: "pending", userDid: user!.did!, requestedAt: new Date() },
                    ],
                }));
            }
        }
    };

    const processIgnoreRequest = async () => {
        if (!user) return;

        let result = await ignoreCircle(circle._id);
        if (result.success) {
            toast({
                icon: "success",
                title: "Ignored",
                description: `You won't see ${circle.name} in recommendations.`,
            });
        }
    };

    const handleButtonClick = async (direction: "left" | "right") => {
        if (direction === "right") {
            setExitX(200);
            await controls.start({ x: 200, opacity: 0 });
            onSwiped(circle, "right");
            await processFollowRequest();
        } else {
            setExitX(-200);
            await controls.start({ x: -200, opacity: 0 });
            onSwiped(circle, "left");
            await processIgnoreRequest();
        }
    };

    return (
        <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={handleDragEnd}
            animate={controls}
            initial={{ x: 0, opacity: 1 }}
            style={{
                zIndex,
                rotateZ: exitX * 0.05, // Add some rotation during exit
                position: "absolute",
                width: "100%",
                maxWidth: "400px",
            }}
            className="h-[500px] rounded-xl border bg-white shadow-lg"
        >
            <div className="flex h-full flex-col overflow-hidden rounded-xl">
                {/* Card Content */}
                <div className="relative h-3/5 w-full overflow-hidden">
                    <Image
                        src={circle.cover?.url ?? "/images/default-cover.png"}
                        alt="Cover"
                        className="object-cover"
                        fill
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
                        <h2 className="text-2xl font-bold">{circle.name}</h2>
                        <div className="flex items-center text-sm">
                            {circle.members} {circle?.members !== 1 ? "followers" : "follower"}
                        </div>
                    </div>
                </div>

                <div className="relative flex justify-center">
                    <div className="absolute top-[-32px] flex justify-center">
                        <div className="h-[64px] w-[64px]">
                            <CirclePicture circle={circle} size="64px" />
                        </div>
                    </div>
                </div>

                <div className="flex flex-1 flex-col p-4 pt-[40px]">
                    <div className="flex justify-center">
                        <CircleTags tags={circle.interests || []} isCompact={true} />
                    </div>

                    {circle.description && (
                        <p className="mt-2 line-clamp-3 text-sm text-gray-600">{circle.description}</p>
                    )}

                    <div className="mt-auto flex justify-center gap-8 pb-4">
                        <Button
                            onClick={() => handleButtonClick("left")}
                            variant="outline"
                            size="icon"
                            className="h-14 w-14 rounded-full border-red-300 hover:bg-red-50 hover:text-red-600"
                        >
                            <X className="h-8 w-8" />
                        </Button>
                        <Button
                            onClick={() => handleButtonClick("right")}
                            variant="outline"
                            size="icon"
                            className="h-14 w-14 rounded-full border-green-300 hover:bg-green-50 hover:text-green-600"
                        >
                            <Check className="h-8 w-8" />
                        </Button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default CircleSwipeCard;
