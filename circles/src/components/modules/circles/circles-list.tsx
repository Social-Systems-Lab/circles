"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ColumnDef, FilterFn, Row } from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Circle, Page } from "@/models/models";
import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import Image from "next/image";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { features } from "@/lib/data/constants";
import { isAuthorized } from "@/lib/auth/client-auth";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { CirclePicture } from "./circle-picture";
import DynamicForm from "@/components/forms/dynamic-form";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import CircleTags from "./circle-tags";

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

    useEffect(() => {
        console.log("CreateCircleButton", circle);
    }, [circle]);

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

interface CirclesListProps {
    circles: Circle[];
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

    return (
        <div className="flex flex-1 flex-row justify-center overflow-hidden">
            <div className="mb-4 ml-4 mr-4 mt-4 flex max-w-[1100px] flex-1 flex-col">
                <div
                    className="mb-4 flex w-full flex-row items-center gap-2"
                    style={{
                        paddingRight: isCompact && !isMobile ? "16px" : "0",
                    }}
                >
                    <Input
                        placeholder="Search circle..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="flex-1"
                    />
                    {canCreateSubcircle && <CreateCircleButton circle={circle} isDefaultCircle={isDefaultCircle} />}
                </div>
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className={
                        isCompact && !isMobile
                            ? "mr-4 grid grid-cols-1 gap-4"
                            : "grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                    }
                >
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
                                className="flex h-full flex-col overflow-hidden rounded-[15px] border shadow transition-shadow duration-200 hover:shadow-md"
                            >
                                <div className="relative h-[150px] w-full overflow-hidden">
                                    <Image
                                        src={circle.cover?.url ?? "/images/default-cover.png"}
                                        alt="Cover"
                                        layout="fill"
                                        objectFit="cover"
                                    />
                                </div>
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
                                    <h4
                                        className="mb-0 mt-2 cursor-pointer text-lg font-bold"
                                        onClick={() =>
                                            router.push(
                                                `/${circle.circleType === "user" ? "users" : "circles"}/${circle.handle}`,
                                            )
                                        }
                                    >
                                        {circle.name}
                                    </h4>
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
                                        onClick={() =>
                                            router.push(
                                                `/${circle.circleType === "user" ? "users" : "circles"}/${circle.handle}`,
                                            )
                                        }
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