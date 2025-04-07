"use client";

import React, { useState } from "react";
import { motion, PanInfo, useAnimation } from "framer-motion";
import { Circle, Media, WithMetric } from "@/models/models";
import Image from "next/image";
import { CirclePicture } from "./circle-picture";
import CircleTags from "./circle-tags";
import { Button } from "@/components/ui/button";
// Removed duplicate Button import
import { Check, ExternalLink, MapPin, Target, X } from "lucide-react"; // Keep ExternalLink
import { useRouter } from "next/navigation";
import { followCircle } from "../home/actions";
import { useToast } from "@/components/ui/use-toast";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { ignoreCircle } from "../home/ignore-actions";
import CircleTypeIndicator from "@/components/utils/circle-type-indicator";
import Indicators from "@/components/utils/indicators";
import ImageCarousel from "@/components/ui/image-carousel";

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

    // Prepare images for the carousel, providing a default if none exist
    const carouselImages: Media[] =
        circle.images && circle.images.length > 0
            ? circle.images
            : [
                  {
                      name: "Default Cover",
                      type: "image/png",
                      fileInfo: { url: "/images/default-cover.png" },
                  },
              ];

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
                width: "calc(100% - 2rem)",
                maxWidth: "400px",
            }}
            // Adjusted height for the card window
            // Adjusted height slightly
            className="formatted relative h-[550px] overflow-hidden rounded-xl border bg-white shadow-lg md:h-[580px]" // Added overflow-hidden and relative
        >
            {/* Inner container for vertical scrolling with subtle scrollbar */}
            <div className="scrollbar-thin scrollbar-thumb-rounded hover:scrollbar-thumb-gray-400 scrollbar-thumb-gray-300 scrollbar-track-transparent absolute inset-0 flex h-full flex-col overflow-y-auto">
                {/* Card Content - Reduced Image Height */}
                <div className="relative h-[280px] w-full flex-shrink-0 overflow-hidden md:h-[300px]">
                    <ImageCarousel
                        images={carouselImages}
                        options={{ loop: carouselImages.length > 1 }}
                        containerClassName="h-full"
                        imageClassName="object-cover"
                        disableSwipe={true}
                    />
                    <div className="absolute right-2 top-2">
                        <CircleTypeIndicator circleType={circle.circleType || "circle"} size="36px" />
                    </div>
                    {circle.metrics && (
                        <Indicators
                            metrics={circle.metrics}
                            className="absolute left-2 top-2"
                            content={circle}
                            tooltipAlign={"start"}
                        />
                    )}
                    <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
                        <h2 className="text-2xl font-bold">{circle.name}</h2>
                        <div className="flex items-center text-sm">
                            {circle.members} {circle?.members !== 1 ? "followers" : "follower"}
                        </div>
                    </div>
                </div>

                {/* Content below image - now inside the scrollable container */}
                <div className="relative flex flex-1 flex-col p-4 pt-2">
                    {/* Picture positioned absolutely over the start of this section */}
                    <div className="absolute left-1/2 top-[-32px] -translate-x-1/2 transform">
                        <div className="h-[64px] w-[64px]">
                            <CirclePicture circle={circle} size="64px" />
                        </div>
                    </div>
                    {/* Spacer for the picture */}
                    <div className="h-[32px]"></div>
                    <div className="flex justify-center">
                        <CircleTags tags={circle.interests || []} isCompact={true} />
                    </div>
                    {/* Description and Mission are prioritized */}
                    <div className="mt-3 space-y-3 px-1 pb-2">
                        {circle.description && <p className="text-sm text-gray-600">{circle.description}</p>}

                        {/* Highlighted Mission Box */}
                        {circle.mission && (
                            <div className="mt-3 rounded-md border bg-gray-50 p-3">
                                <h3 className="mb-1 flex items-center text-sm font-semibold text-gray-800">
                                    <Target className="mr-1.5 h-4 w-4 text-gray-600" /> Mission
                                </h3>
                                <p className="text-sm text-gray-700">{circle.mission}</p>
                            </div>
                        )}

                        {/* Other details appear further down in scroll */}
                        {circle.location &&
                            (circle.location.city || circle.location.region || circle.location.country) && (
                                <div className="mt-3">
                                    <h3 className="mb-1 flex items-center text-sm font-semibold text-gray-700">
                                        <MapPin className="mr-1.5 h-4 w-4 text-gray-600" /> Location
                                    </h3>
                                    <p className="text-sm text-gray-700">
                                        {[circle.location.city, circle.location.region, circle.location.country]
                                            .filter(Boolean)
                                            .join(", ")}
                                    </p>
                                </div>
                            )}

                        {circle.causes && circle.causes.length > 0 && (
                            <div className="mt-3">
                                <h3 className="mb-1 text-sm font-semibold text-gray-700">Causes</h3>
                                <CircleTags tags={circle.causes} isCompact={true} />
                            </div>
                        )}

                        {circle.skills && circle.skills.length > 0 && (
                            <div className="mt-3">
                                <h3 className="mb-1 text-sm font-semibold text-gray-700">Skills</h3>
                                <CircleTags tags={circle.skills} isCompact={true} />
                            </div>
                        )}
                    </div>
                    {/* Add padding at the bottom of scrollable content to avoid being hidden by fixed buttons */}
                    <div className="h-20 flex-shrink-0"></div> {/* Keep padding */}
                </div>
            </div>{" "}
            {/* End of inner scrollable div */}
            {/* --- Action Buttons --- */}
            {/* Container for all bottom buttons, positioned absolutely within the main motion.div */}
            <div className="pointer-events-none absolute bottom-4 left-0 right-0 px-4">
                {/* Centered Ignore/Follow Buttons */}
                <div className="pointer-events-auto flex justify-center gap-8">
                    <Button
                        onClick={() => handleButtonClick("left")}
                        variant="outline"
                        size="icon"
                        className="h-14 w-14 rounded-full border-red-300 bg-white hover:bg-red-50 hover:text-red-600"
                    >
                        <X className="h-8 w-8" />
                    </Button>
                    <Button
                        onClick={() => handleButtonClick("right")}
                        variant="outline"
                        size="icon"
                        className="h-14 w-14 rounded-full border-green-300 bg-white hover:bg-green-50 hover:text-green-600"
                    >
                        <Check className="h-8 w-8" />
                    </Button>
                </div>

                {/* Smaller Open Circle Button in Bottom Right */}
                {circle.handle && (
                    <div className="pointer-events-auto absolute bottom-0 right-4">
                        <Button
                            onClick={() => router.push(`/circles/${circle.handle}`)}
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 rounded-full border-blue-300 bg-white hover:bg-blue-50 hover:text-blue-600" // Smaller size
                        >
                            <ExternalLink className="h-5 w-5" /> {/* Smaller icon */}
                        </Button>
                    </div>
                )}
            </div>
        </motion.div> // End of main motion.div
    );
};

export default CircleSwipeCard;
