"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Circle, ContentPreviewData, Page, WithMetric } from "@/models/models";
import { Button } from "@/components/ui/button";
import { AudioLines, Clock, MapPin, Plus, Star } from "lucide-react";
import Image from "next/image";
import { useAtom } from "jotai";
import { contentPreviewAtom, userAtom } from "@/lib/data/atoms";
import { features } from "@/lib/data/constants";
import { isAuthorized } from "@/lib/auth/client-auth";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { CirclePicture } from "./circle-picture";
import DynamicForm from "@/components/forms/dynamic-form";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import CircleTags from "./circle-tags";
import CircleHeader from "./circle-header";
import Indicators from "@/components/utils/indicators";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const twoLineEllipsisStyle = {
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    display: "-webkit-box",
    textOverflow: "ellipsis",
    overflow: "hidden",
};

interface InviteButtonProps {
    circle: Circle;
    isDefaultCircle: boolean;
}

const CreateCircleButton: React.FC<InviteButtonProps> = ({ circle, isDefaultCircle }) => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const isCompact = useIsCompact();

    return (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                <Button
                    variant={isCompact ? "ghost" : "outline"}
                    className={isCompact ? "h-[32px] w-[32px] p-0" : "gap-2"}
                >
                    <Plus className="h-4 w-4" />
                    {isCompact ? "" : "Create Circle"}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DynamicForm
                    formSchemaId="create-circle-form"
                    initialFormData={{ parentCircleId: circle._id }}
                    maxWidth="100%"
                />
            </DialogContent>
        </Dialog>
    );
};

export const ListFilter = () => {
    const [filter, setFilter] = React.useState("top");

    return (
        <div className="w-full border-b border-gray-200 px-2 py-1 dark:border-gray-700">
            <RadioGroup defaultValue="top" onValueChange={setFilter} className="flex space-x-1">
                <div className="flex-1">
                    <RadioGroupItem value="top" id="top" className="peer sr-only" />
                    <Label
                        htmlFor="top"
                        className="flex h-8 items-center justify-center rounded-md px-2 hover:bg-gray-100 peer-data-[state=checked]:border peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:bg-blue-50 dark:hover:bg-gray-800 dark:peer-data-[state=checked]:border-blue-400 dark:peer-data-[state=checked]:bg-blue-900"
                    >
                        <Star className="mr-1 h-3 w-3 text-gray-500 peer-data-[state=checked]:text-blue-500 dark:text-gray-400 dark:peer-data-[state=checked]:text-blue-400" />
                        <span className="text-xs font-medium text-gray-700 peer-data-[state=checked]:text-blue-500 dark:text-gray-300 dark:peer-data-[state=checked]:text-blue-400">
                            Top
                        </span>
                    </Label>
                </div>
                <div className="flex-1">
                    <RadioGroupItem value="near" id="near" className="peer sr-only" />
                    <Label
                        htmlFor="near"
                        className="flex h-8 items-center justify-center rounded-md px-2 hover:bg-gray-100 peer-data-[state=checked]:border peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:bg-blue-50 dark:hover:bg-gray-800 dark:peer-data-[state=checked]:border-blue-400 dark:peer-data-[state=checked]:bg-blue-900"
                    >
                        <MapPin className="mr-1 h-3 w-3 text-gray-500 peer-data-[state=checked]:text-blue-500 dark:text-gray-400 dark:peer-data-[state=checked]:text-blue-400" />
                        <span className="text-xs font-medium text-gray-700 peer-data-[state=checked]:text-blue-500 dark:text-gray-300 dark:peer-data-[state=checked]:text-blue-400">
                            Near
                        </span>
                    </Label>
                </div>
                <div className="flex-1">
                    <RadioGroupItem value="new" id="new" className="peer sr-only" />
                    <Label
                        htmlFor="new"
                        className="flex h-8 items-center justify-center rounded-md px-2 hover:bg-gray-100 peer-data-[state=checked]:border peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:bg-blue-50 dark:hover:bg-gray-800 dark:peer-data-[state=checked]:border-blue-400 dark:peer-data-[state=checked]:bg-blue-900"
                    >
                        <Clock className="mr-1 h-3 w-3 text-gray-500 peer-data-[state=checked]:text-blue-500 dark:text-gray-400 dark:peer-data-[state=checked]:text-blue-400" />
                        <span className="text-xs font-medium text-gray-700 peer-data-[state=checked]:text-blue-500 dark:text-gray-300 dark:peer-data-[state=checked]:text-blue-400">
                            New
                        </span>
                    </Label>
                </div>
                <div className="flex-1">
                    <RadioGroupItem value="vibe" id="vibe" className="peer sr-only" />
                    <Label
                        htmlFor="vibe"
                        className="flex h-8 items-center justify-center rounded-md px-2 hover:bg-gray-100 peer-data-[state=checked]:border peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:bg-blue-50 dark:hover:bg-gray-800 dark:peer-data-[state=checked]:border-blue-400 dark:peer-data-[state=checked]:bg-blue-900"
                    >
                        <AudioLines className="mr-1 h-3 w-3 text-gray-500 peer-data-[state=checked]:text-blue-500 dark:text-gray-400 dark:peer-data-[state=checked]:text-blue-400" />
                        <span className="text-xs font-medium text-gray-700 peer-data-[state=checked]:text-blue-500 dark:text-gray-300 dark:peer-data-[state=checked]:text-blue-400">
                            Vibe
                        </span>
                    </Label>
                </div>
            </RadioGroup>
        </div>
    );
};
interface CirclesListProps {
    circles: WithMetric<Circle>[];
    circle: Circle;
    page: Page;
    isDefaultCircle: boolean;
}

const CirclesList: React.FC<CirclesListProps> = ({ circle, circles, page, isDefaultCircle }) => {
    const [user] = useAtom(userAtom);
    const isCompact = useIsCompact();
    const isMobile = useIsMobile();
    const canCreateSubcircle = isAuthorized(user, circle, features.create_subcircle);
    const router = useRouter();
    const isUser = circle.circleType === "user";
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [searchQuery, setSearchQuery] = useState("");
    const filteredCircles = useMemo(() => {
        if (searchQuery) {
            return circles.filter((circle) => circle?.name?.toLowerCase().includes(searchQuery.toLowerCase()));
        } else {
            return circles;
        }
    }, [circles, searchQuery]);

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
            type: "circle",
            content: circle,
        };

        setContentPreview((x) => (x?.content === circle ? undefined : contentPreviewData));
    };

    return (
        <div className="flex flex-1 flex-row justify-center overflow-hidden">
            <div className="mb-4 ml-4 mr-4 mt-4 flex max-w-[1100px] flex-1 flex-col">
                <CircleHeader circle={circle} page={page} isDefaultCircle={isDefaultCircle} />
                <div
                    className="mb-4 flex w-full flex-row items-center gap-2"
                    style={{
                        paddingRight: isCompact && !isMobile ? "16px" : "0",
                    }}
                >
                    <Input
                        placeholder="Search circles..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="flex-1"
                    />
                    {canCreateSubcircle && <CreateCircleButton circle={circle} isDefaultCircle={isDefaultCircle} />}
                </div>

                <ListFilter />

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
                                className={`flex h-full cursor-pointer flex-col overflow-hidden rounded-[15px] border-0 ${circle.handle === contentPreview?.handle ? "bg-[#f7f7f7]" : "bg-white"} relative shadow-lg transition-shadow duration-200 hover:shadow-md md:min-w-[200px] md:max-w-[420px]`}
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
                                    <Indicators metrics={circle.metrics} className="absolute left-2 top-2" />
                                )}

                                <div className="relative flex justify-center">
                                    <div className="absolute top-[-32px] flex justify-center">
                                        <div className="h-[64px] w-[64px]">
                                            <CirclePicture
                                                name={circle.name}
                                                picture={circle.picture?.url}
                                                size="64px"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="pt-[32px] text-center">
                                    <h4 className="mb-0 mt-2 cursor-pointer text-lg font-bold">{circle.name}</h4>
                                    <div className="flex flex-row items-center justify-center text-sm text-gray-500">
                                        {circle.members}{" "}
                                        {circle?.members !== 1
                                            ? isUser
                                                ? "friends"
                                                : "members"
                                            : isUser
                                              ? "friend"
                                              : "member"}
                                    </div>

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
