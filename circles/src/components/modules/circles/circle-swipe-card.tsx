"use client";

import React, { useState, useRef, useEffect } from "react"; // Added useRef, useEffect
import { motion, PanInfo, useAnimation, useMotionValue, useTransform, animate } from "framer-motion"; // Added motionValue, useTransform, animate
import { Circle, Media, WithMetric } from "@/models/models";
import Image from "next/image";
import { CirclePicture } from "./circle-picture";
import CircleTags from "./circle-tags";
import { Button } from "@/components/ui/button";
import { Check, ExternalLink, MapPin, Quote, X } from "lucide-react"; // Removed Target
import { useRouter } from "next/navigation";
import { followCircle } from "../home/actions";
import { useToast } from "@/components/ui/use-toast";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { ignoreCircle } from "../home/ignore-actions";
import CircleTypeIndicator from "@/components/utils/circle-type-indicator";
import Indicators from "@/components/utils/indicators";
import ImageCarousel from "@/components/ui/image-carousel";
import { sdgs } from "@/lib/data/sdgs";
import { skills } from "@/lib/data/skills";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge"; // Import Badge for pills

// Helper mappings for quick lookup
const sdgMap = new Map(sdgs.map((s) => [s.handle, s]));
const skillMap = new Map(skills.map((s) => [s.handle, s]));

interface CircleSwipeCardProps {
    circle: WithMetric<Circle>;
    onSwiped: (circle: Circle, direction: "left" | "right") => void;
    zIndex: number;
}

export const CircleSwipeCard: React.FC<CircleSwipeCardProps> = ({ circle, onSwiped, zIndex }) => {
    const controls = useAnimation(); // Still used for button clicks/programmatic animation
    const router = useRouter();
    const { toast } = useToast();
    const [user, setUser] = useAtom(userAtom);

    // Manual gesture handling state
    const x = useMotionValue(0); // Card horizontal position
    const rotate = useTransform(x, [-200, 0, 200], [-10, 0, 10], { clamp: false }); // Rotation based on x
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [lockedDirection, setLockedDirection] = useState<"x" | "y" | null>(null);
    const startScrollTop = useRef(0); // Store scroll position at pan start

    const handlePanStart = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        setLockedDirection(null); // Reset lock on new pan
        if (scrollContainerRef.current) {
            startScrollTop.current = scrollContainerRef.current.scrollTop; // Record initial scroll
        }
    };

    const handlePan = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        let currentDirection = lockedDirection;

        // Lock direction based on initial movement
        if (!currentDirection) {
            const absDeltaX = Math.abs(info.delta.x);
            const absDeltaY = Math.abs(info.delta.y);
            const lockThreshold = 5; // Pixels before locking direction

            if (absDeltaX > lockThreshold || absDeltaY > lockThreshold) {
                currentDirection = absDeltaX > absDeltaY ? "x" : "y";
                setLockedDirection(currentDirection);
            }
        }

        // Apply movement based on locked direction
        if (currentDirection === "x") {
            x.set(x.get() + info.delta.x);
        } else if (currentDirection === "y" && scrollContainerRef.current) {
            const newScrollTop = startScrollTop.current - info.offset.y; // Invert offset for scroll
            const maxScroll = scrollContainerRef.current.scrollHeight - scrollContainerRef.current.clientHeight;
            scrollContainerRef.current.scrollTop = Math.max(0, Math.min(maxScroll, newScrollTop));
        }
    };

    const handlePanEnd = async (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        const swipeThreshold = 100;
        const finalX = x.get();
        let swipeDirection: "left" | "right" | null = null;

        if (lockedDirection === "x") {
            if (finalX > swipeThreshold) {
                swipeDirection = "right";
            } else if (finalX < -swipeThreshold) {
                swipeDirection = "left";
            }
        }

        if (swipeDirection) {
            const exitTarget = swipeDirection === "right" ? 300 : -300;
            await animate(x, exitTarget, { type: "spring", stiffness: 300, damping: 30 });
            onSwiped(circle, swipeDirection);
            if (swipeDirection === "right") {
                await processFollowRequest();
            } else {
                await processIgnoreRequest();
            }
        } else if (lockedDirection === "x") {
            // Animate back to center if not swiped
            animate(x, 0, { type: "spring", stiffness: 300, damping: 30 });
        }

        // Reset scroll position tracking after pan ends
        if (scrollContainerRef.current) {
            startScrollTop.current = scrollContainerRef.current.scrollTop;
        }
        setLockedDirection(null); // Always reset lock at the end
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
            // Animate out using motion value
            await animate(x, 300, { type: "spring", stiffness: 300, damping: 30 });
            onSwiped(circle, "right");
            await processFollowRequest();
        } else {
            // Animate out using motion value
            await animate(x, -300, { type: "spring", stiffness: 300, damping: 30 });
            onSwiped(circle, "left");
            await processIgnoreRequest();
        }
    };

    // Effect to reset x if the circle prop changes (e.g., parent component reorders)
    useEffect(() => {
        x.set(0);
    }, [circle._id, x]);

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
            // Removed drag props
            onPanStart={handlePanStart}
            onPan={handlePan}
            onPanEnd={handlePanEnd}
            // Removed animate={controls} - now driven by x motion value or animate()
            initial={{ opacity: 1 }} // Keep initial opacity
            style={{
                x, // Bind horizontal position to motion value
                rotate, // Bind rotation to transformed motion value
                zIndex,
                position: "absolute",
                width: "calc(100% - 2rem)",
                maxWidth: "400px",
                touchAction: "none", // Disable browser default touch actions as we handle manually
            }}
            className="relative h-[450px] cursor-grab overflow-hidden rounded-xl border bg-white shadow-lg active:cursor-grabbing md:h-[560px]"
        >
            {/* Scroll container - Now overflow-hidden, controlled manually */}
            <div
                ref={scrollContainerRef}
                className="custom-scrollbar absolute inset-0 flex h-full flex-col overflow-hidden" // Changed to overflow-hidden
                style={{ touchAction: "pan-y" }} // Allow vertical pan only on this element
            >
                {/* Content that can scroll */}
                <div className="flex-shrink-0">
                    {" "}
                    {/* Wrap scrollable content */}
                    <div className="relative h-[220px] w-full flex-shrink-0 overflow-hidden md:h-[300px]">
                        <ImageCarousel
                            images={carouselImages} // Use the variable defined earlier
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
                </div>
                {/* Content below image - now inside the scrollable container */}
                <div className="relative flex flex-1 flex-col p-4 pt-2">
                    {/* Picture positioned absolutely over the start of this section */}
                    <div className="absolute left-1/2 top-[-45px] -translate-x-1/2 transform">
                        <div className="h-[90px] w-[90px]">
                            <CirclePicture circle={circle} size="90px" />
                        </div>
                    </div>
                    {/* Spacer for the picture */}
                    <div className="h-[32px]"></div>
                    <div className="flex justify-center">
                        <CircleTags tags={circle.interests || []} isCompact={true} />
                    </div>
                    {/* Description and Mission are prioritized */}
                    <div className="space-y-3 px-1 pb-2">
                        {/* Mission Box with Quote Icon */}
                        {circle.mission && (
                            <div className="relative mt-3 rounded-md border bg-gray-50/80 p-3 pl-8 shadow-sm">
                                <Quote className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
                                <p className="text-sm text-gray-700">{circle.mission}</p>
                            </div>
                        )}

                        {circle.description && <p className="text-sm text-gray-600">{circle.description}</p>}

                        {/* {circle.content && (
                            <div className="min-w-0 break-words">
                                <RichText content={circle.content} />
                            </div>
                        )} */}

                        {/* SDGs Pills */}
                        {circle.causes && circle.causes.length > 0 && (
                            <div className="mt-4">
                                <h3 className="mb-1.5 text-xs font-medium uppercase text-gray-500">SDGs</h3>
                                <div className="flex flex-wrap items-center gap-2">
                                    {circle.causes.slice(0, 8).map((handle) => {
                                        // Limit pills shown
                                        const sdg = sdgMap.get(handle);
                                        if (!sdg) return null;
                                        return (
                                            <Badge
                                                key={handle}
                                                variant="outline"
                                                className="flex items-center gap-1.5 px-2 py-1"
                                            >
                                                <Image
                                                    src={sdg.picture.url}
                                                    alt="" // Alt handled by text
                                                    width={16}
                                                    height={16}
                                                    className="h-4 w-4 rounded-full object-cover"
                                                />
                                                <span className="text-xs font-medium">{sdg.name}</span>
                                            </Badge>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Skills/Needs Pills */}
                        {circle.skills && circle.skills.length > 0 && (
                            <div className="mt-4">
                                <h3 className="mb-1.5 text-xs font-medium uppercase text-gray-500">
                                    {circle.circleType === "user" ? "Skills" : "Needs"}
                                </h3>
                                <div className="flex flex-wrap items-center gap-2">
                                    {circle.skills!.slice(0, 8).map((handle) => {
                                        const skill = skillMap.get(handle);
                                        if (!skill) return null;
                                        return (
                                            <Badge
                                                key={handle}
                                                variant="outline"
                                                className="flex items-center gap-1.5 px-2 py-1"
                                            >
                                                <Image
                                                    src={skill.picture.url}
                                                    alt="" // Alt handled by text
                                                    width={16}
                                                    height={16}
                                                    className="h-4 w-4 rounded-full object-cover"
                                                />
                                                <span className="text-xs font-medium">{skill.name}</span>
                                            </Badge>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Location (moved down, inline icon, no heading) */}
                        {circle.location &&
                            (circle.location.city || circle.location.region || circle.location.country) && (
                                <div className="flex items-center pt-2 text-sm text-gray-600">
                                    <MapPin className="mr-1.5 h-4 w-4 flex-shrink-0 text-gray-500" />
                                    <span>
                                        {[circle.location.city, circle.location.region, circle.location.country]
                                            .filter(Boolean)
                                            .join(", ")}
                                    </span>
                                </div>
                            )}
                    </div>
                    {/* End of direct content within scroll container */}
                </div>{" "}
                {/* End of scrollable content wrapper */}
            </div>
            {/* End of scroll container div */}
            {/* --- Action Buttons --- */}
            {/* Container for all bottom buttons, positioned absolutely within the main motion.div */}
            <div className="pointer-events-none absolute bottom-4 left-0 right-0 px-4">
                {/* Centered Ignore/Follow Buttons */}
                <div className="pointer-events-auto flex justify-center gap-8">
                    <Button
                        onClick={() => handleButtonClick("left")}
                        variant="outline"
                        size="icon"
                        className="h-14 w-14 rounded-full border-red-300 bg-red-100 shadow-lg hover:bg-red-50 hover:text-red-600"
                    >
                        <X className="h-8 w-8" />
                    </Button>
                    <Button
                        onClick={() => handleButtonClick("right")}
                        variant="outline"
                        size="icon"
                        className="h-14 w-14 rounded-full border-green-300 bg-green-100 shadow-lg hover:bg-green-200 hover:text-green-600"
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
