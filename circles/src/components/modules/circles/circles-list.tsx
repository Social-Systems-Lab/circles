"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Circle, ContentPreviewData, Page, WithMetric } from "@/models/models";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Image from "next/image";
import { useAtom } from "jotai";
import { contentPreviewAtom, sidePanelContentVisibleAtom, userAtom } from "@/lib/data/atoms";
import { features, LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { isAuthorized } from "@/lib/auth/client-auth";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { CirclePicture } from "./circle-picture";
import DynamicForm from "@/components/forms/dynamic-form";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import CircleTags from "./circle-tags";
import CircleHeader from "./circle-header";
import Indicators from "@/components/utils/indicators";
import { ListFilter } from "@/components/utils/list-filter";
import emptyFeed from "@images/empty-feed.png";
import { updateQueryParam } from "@/lib/utils/helpers-client";
import Link from "next/link";

export const twoLineEllipsisStyle = {
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    display: "-webkit-box",
    textOverflow: "ellipsis",
    overflow: "hidden",
};

type CreateCircleButtonProps = {
    circle: Circle;
    isDefaultCircle: boolean;
};

export const CreateCircleButton: React.FC<CreateCircleButtonProps> = ({ circle }) => {
    const isCompact = useIsCompact();
    const parentId = circle?._id;

    return (
        <Link href={`/circles/new?parentCircleId=${parentId}`}>
            <Button variant={isCompact ? "ghost" : "outline"} className={isCompact ? "h-[32px] w-[32px] p-0" : "gap-2"}>
                <Plus className="h-4 w-4" />
                {isCompact ? "" : "Create Circle"}
            </Button>
        </Link>
    );
};

interface CirclesListProps {
    circles: WithMetric<Circle>[];
    circle: Circle;
    page?: Page;
    isDefaultCircle: boolean;
    activeTab?: string;
    inUser?: boolean;
}

const CirclesList = ({ circle, circles, page, isDefaultCircle, activeTab, inUser }: CirclesListProps) => {
    const [user] = useAtom(userAtom);
    const isCompact = useIsCompact();
    const isMobile = useIsMobile();
    const canCreateSubcircle = isAuthorized(user, circle, features.create_subcircle);
    const router = useRouter();
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [searchQuery, setSearchQuery] = useState("");
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const filteredCircles = useMemo(() => {
        if (searchQuery) {
            return circles.filter((circle) => circle?.name?.toLowerCase().includes(searchQuery.toLowerCase()));
        } else {
            return circles;
        }
    }, [circles, searchQuery]);

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.CirclesList.1");
        }
    }, []);

    const containerVariants = {
        hidden: {},
        visible: {
            transition: {
                staggerChildren: 0.1, // Adjust this value to control the delay between animations
            },
        },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: (index: number) => ({
            opacity: 1,
            y: 0,
            transition: {
                delay: index * 0.1, // Adjust this multiplier to control the delay for each item
                type: "spring",
                stiffness: 100,
                damping: 15,
            },
        }),
    };

    const handleCircleClick = (circle: Circle) => {
        let contentPreviewData: ContentPreviewData = {
            type: circle?.circleType === "user" ? "user" : "circle",
            content: circle,
        };

        setContentPreview((x) =>
            x?.content === circle && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );
    };

    const handleFilterChange = (filter: string) => {
        updateQueryParam(router, "sort", filter);
    };

    return (
        <div className="flex flex-1 flex-row justify-center overflow-hidden">
            <div className="mb-4 ml-4 mr-4 mt-4 flex max-w-[1100px] flex-1 flex-col">
                {/* <CircleHeader circle={circle} page={page} isDefaultCircle={isDefaultCircle} /> */}
                <div
                    className="flex w-full flex-row items-center gap-2"
                    style={{
                        paddingRight: isCompact && !isMobile ? "16px" : "0",
                    }}
                >
                    <Input
                        placeholder={`Search followers...`}
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="flex-1"
                    />
                    {canCreateSubcircle && !inUser && (
                        <CreateCircleButton circle={circle} isDefaultCircle={isDefaultCircle} />
                    )}
                </div>

                <ListFilter onFilterChange={handleFilterChange} />

                {filteredCircles.length === 0 && activeTab === "following" && (
                    <div className="flex h-full flex-col items-center justify-center">
                        <Image src={emptyFeed} alt="No posts yet" width={isMobile ? 230 : 300} />
                        <h4>No {inUser ? "users" : "circles"}</h4>
                        <div className="max-w-[700px] pl-4 pr-4">
                            You are not following {inUser ? "anyone" : "any circles"}. Try the discover tab to find new{" "}
                            {inUser ? "users" : "circles"} to follow.
                        </div>
                        <div className="mt-4 flex flex-row gap-2">
                            <Button variant={"outline"} onClick={() => updateQueryParam(router, "tab", "discover")}>
                                Discover
                            </Button>
                        </div>
                    </div>
                )}

                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid gap-6"
                    style={{
                        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                        gridAutoRows: "1fr",
                    }}
                >
                    {/* fcfbf7 */}
                    <AnimatePresence mode="popLayout">
                        {filteredCircles.map((circle, index) => (
                            <motion.div
                                key={circle._id}
                                variants={itemVariants}
                                custom={index}
                                initial="hidden"
                                animate="visible"
                                exit="hidden"
                                layout
                                className={`flex h-full cursor-pointer flex-col overflow-hidden rounded-[15px] border-0 ${circle._id === contentPreview?.content?._id ? "bg-[#f7f7f7]" : "bg-white"} relative shadow-lg transition-shadow duration-200 hover:shadow-md md:min-w-[200px] md:max-w-[420px]`}
                                onClick={() => handleCircleClick(circle)}
                            >
                                <div className="relative h-[150px] w-full overflow-hidden">
                                    <Image
                                        src={circle.cover?.url ?? "/images/default-cover.png"}
                                        alt="Cover"
                                        className="bg-white object-cover"
                                        fill
                                    />
                                </div>

                                {circle.metrics && (
                                    <Indicators
                                        metrics={circle.metrics}
                                        className="absolute left-2 top-2"
                                        content={circle}
                                    />
                                )}

                                <div className="relative flex justify-center">
                                    <div className="absolute top-[-32px] flex justify-center">
                                        <div className="h-[64px] w-[64px]">
                                            <CirclePicture circle={circle} size="64px" />
                                        </div>
                                    </div>
                                </div>
                                <div className="pt-[32px] text-center">
                                    <h4 className="mb-0 mt-2 cursor-pointer text-lg font-bold">{circle.name}</h4>
                                    {circle?.circleType !== "user" ? (
                                        <div className="flex flex-row items-center justify-center text-sm text-gray-500">
                                            {circle.members} {circle?.members !== 1 ? "followers" : "follower"}
                                        </div>
                                    ) : (
                                        <div className="bg-blue flex h-5 w-2 flex-row items-center justify-center text-sm text-gray-500"></div>
                                    )}

                                    <div className="flex justify-center pl-2 pr-2">
                                        <CircleTags tags={circle.interests} isCompact={true} />
                                    </div>

                                    {circle.description && (
                                        <p className="line-clamp-2 pl-1 pr-1 pt-2 text-[15px]">{circle.description}</p>
                                    )}
                                </div>
                                <div className="mt-auto flex">
                                    <Button
                                        variant="outline"
                                        className="m-2 mt-4 w-full"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(`/circles/${circle.handle}`);
                                        }}
                                    >
                                        Open
                                    </Button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </motion.div>
            </div>
        </div>
    );
};

export default CirclesList;
