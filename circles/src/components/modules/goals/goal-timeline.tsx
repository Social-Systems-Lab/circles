// src/components/modules/goals/goal-timeline.tsx
"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import { GoalDisplay, Circle, GoalPermissions, GoalStage } from "@/models/models";
import { getGoalsAction, getCompletedGoalsAction } from "@/app/circles/[handle]/goals/actions"; // Added getCompletedGoalsAction
import { Loader2, CalendarIcon, Plus, Clock, Target } from "lucide-react"; // Added Target icon
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime"; // Correct import path
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CreateGoalDialog from "@/components/global-create/create-goal-dialog"; // Import CreateGoalDialog

interface GoalTimelineProps {
    circle: Circle;
    permissions: GoalPermissions;
    initialGoalsData?: { goals: GoalDisplay[] };
    canCreateGoal: boolean;
}

// --- Goal Card Component ---
interface GoalCardProps {
    goal: GoalDisplay;
    circleHandle: string;
    canCreateTask: boolean; // New prop
    tasksModuleEnabled: boolean; // New prop
    router: AppRouterInstance; // New prop
}

const GoalCard: React.FC<GoalCardProps> = ({ goal, circleHandle, canCreateTask, tasksModuleEnabled, router }) => {
    const isReview = goal.stage === "review";

    const handleCreateTaskClick = (e: React.MouseEvent) => {
        e.preventDefault(); // Prevent link navigation
        e.stopPropagation(); // Prevent card click event bubbling
        router.push(`/circles/${circleHandle}/tasks/create?goalId=${goal._id}`);
    };

    return (
        <Link key={goal._id} href={`/circles/${circleHandle}/goals/${goal._id}`} className="group relative block">
            {" "}
            {/* Added relative positioning */}
            <Card
                className={cn(
                    "h-full transition-shadow duration-200 ease-in-out group-hover:shadow-lg", // Use group-hover for card shadow
                    isReview && "border-dashed border-yellow-400 bg-yellow-50/30 opacity-75",
                )}
            >
                <CardContent className="flex items-start space-x-4 p-4">
                    {goal.images && goal.images.length > 0 && (
                        <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded border">
                            <Image
                                src={goal.images[0].fileInfo.url}
                                alt={goal.title}
                                layout="fill"
                                objectFit="cover"
                                className="transition-transform duration-200 ease-in-out group-hover:scale-105"
                            />
                        </div>
                    )}
                    <div className="min-w-0 flex-grow">
                        <div className="mb-1 flex items-center justify-between">
                            <div className="header mb-1 truncate text-[24px] font-semibold group-hover:text-primary">
                                {goal.title}
                            </div>
                            {isReview && (
                                <Badge
                                    variant="outline"
                                    className="ml-2 border-yellow-400 bg-yellow-100 text-xs text-yellow-800"
                                >
                                    <Clock className="mr-1 h-3 w-3" />
                                    Review
                                </Badge>
                            )}
                        </div>
                        <p className="mb-2 line-clamp-3 text-sm text-muted-foreground">{goal.description}</p>
                        {goal.targetDate && (
                            <div className="flex items-center text-xs text-muted-foreground">
                                <CalendarIcon className="mr-1 h-3 w-3" />
                                Target: {format(new Date(goal.targetDate), "MMM d, yyyy")}
                            </div>
                        )}
                    </div>
                </CardContent>
                {/* Create Task Button - Appears on Hover */}
                {tasksModuleEnabled && canCreateTask && (
                    <Button
                        variant="secondary"
                        size="sm"
                        className="absolute bottom-3 right-3 z-10 scale-90 opacity-0 transition-all duration-200 ease-in-out group-hover:scale-100 group-hover:opacity-100"
                        onClick={handleCreateTaskClick}
                    >
                        <Plus className="mr-1.5 h-4 w-4" /> Create Task
                    </Button>
                )}
            </Card>
        </Link>
    );
};

// Array of colors indexed by month number (0-11)
const monthColorClasses = [
    "bg-red-400", // Jan
    "bg-orange-400", // Feb
    "bg-amber-400", // Mar
    "bg-yellow-400", // Apr
    "bg-lime-400", // May
    "bg-green-400", // Jun
    "bg-emerald-400", // Jul
    "bg-teal-400", // Aug
    "bg-cyan-400", // Sep
    "bg-sky-400", // Oct
    "bg-blue-400", // Nov
    "bg-indigo-400", // Dec
];

// Helper function to group goals by year/month (using month number) or into a 'no_date' category
const groupGoalsByDate = (goals: GoalDisplay[], sortDirection: "asc" | "desc" = "asc") => {
    const datedGoals = goals
        .filter((goal) => goal.targetDate)
        .sort((a, b) => {
            const timeA = new Date(a.targetDate!).getTime();
            const timeB = new Date(b.targetDate!).getTime();
            return sortDirection === "asc" ? timeA - timeB : timeB - timeA;
        });
    const undatedGoals = goals
        .filter((goal) => !goal.targetDate)
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

    // Grouping by year (string) and month number (number)
    const grouped: Record<string, Record<number, GoalDisplay[]>> = {};

    datedGoals.forEach((goal) => {
        const date = new Date(goal.targetDate!);
        const year = date.getFullYear().toString();
        const month = date.getMonth(); // Get month number (0-11)

        if (!grouped[year]) grouped[year] = {};
        if (!grouped[year][month]) grouped[year][month] = [];
        grouped[year][month].push(goal);
    });

    // Keep undated goals separate if they exist
    const result: { dated: typeof grouped; undated: GoalDisplay[] } = {
        dated: grouped,
        undated: undatedGoals,
    };

    // This part seems incorrect for the new structure, let's adjust how undated are handled below
    /* if (undatedGoals.length > 0) {
        result["no_date"] = { "Goals without Target Date": undatedGoals }; // Keep undated separate
    } */

    return result;
};

const GoalTimeline: React.FC<GoalTimelineProps> = ({ circle, permissions, initialGoalsData, canCreateGoal }) => {
    // Initialize active goals from initialGoalsData, filtering for 'review' or 'open'
    const [activeGoalsData, setActiveGoalsData] = useState<GoalDisplay[]>(
        initialGoalsData?.goals?.filter((g) => g.stage === "review" || g.stage === "open") || [],
    );
    // Initialize completed goals from initialGoalsData, filtering for 'completed'
    const [completedGoalsData, setCompletedGoalsData] = useState<GoalDisplay[]>(
        initialGoalsData?.goals?.filter((g) => g.stage === "completed") || [],
    );

    // Determine initial loading state based on whether initialGoalsData was provided and if it contained relevant goals
    const [isLoadingActive, setIsLoadingActive] = useState(
        !initialGoalsData ||
            (initialGoalsData?.goals?.filter((g) => g.stage === "review" || g.stage === "open").length === 0 &&
                activeGoalsData.length === 0),
    );
    const [isLoadingCompleted, setIsLoadingCompleted] = useState(
        !initialGoalsData ||
            (initialGoalsData?.goals?.filter((g) => g.stage === "completed").length === 0 &&
                completedGoalsData.length === 0),
    );

    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [isCreateGoalDialogOpen, setIsCreateGoalDialogOpen] = useState(false); // State for dialog

    // Check if tasks module is enabled
    const tasksModuleEnabled = useMemo(() => circle.enabledModules?.includes("tasks"), [circle.enabledModules]);

    // Effect to fetch data when tab changes or if initial data for that tab was missing/empty
    useEffect(() => {
        const fetchGoals = async () => {
            if (activeTab === "active") {
                // Fetch active goals only if they weren't loaded initially or if the activeGoalsData is empty
                if (
                    (!initialGoalsData ||
                        initialGoalsData.goals?.filter((g) => g.stage === "review" || g.stage === "open").length ===
                            0) &&
                    activeGoalsData.length === 0
                ) {
                    setIsLoadingActive(true);
                    setError(null);
                    try {
                        const result = await getGoalsAction(circle.handle as string);
                        setActiveGoalsData(
                            result.goals?.filter((g) => g.stage === "review" || g.stage === "open") || [],
                        );
                    } catch (err) {
                        console.error("Error fetching active goals:", err);
                        setError("Failed to load active goals.");
                    } finally {
                        setIsLoadingActive(false);
                    }
                } else if (initialGoalsData && activeGoalsData.length === 0) {
                    // If initialGoalsData was provided but resulted in empty activeGoalsData (e.g. all goals were completed)
                    setActiveGoalsData(
                        initialGoalsData.goals?.filter((g) => g.stage === "review" || g.stage === "open") || [],
                    );
                    setIsLoadingActive(false); // No need to fetch if initial data was processed
                } else {
                    setIsLoadingActive(false); // Already loaded or has initial data
                }
            } else if (activeTab === "completed") {
                // Fetch completed goals only if they weren't loaded initially or if completedGoalsData is empty
                if (
                    (!initialGoalsData ||
                        initialGoalsData.goals?.filter((g) => g.stage === "completed").length === 0) &&
                    completedGoalsData.length === 0
                ) {
                    setIsLoadingCompleted(true);
                    setError(null);
                    try {
                        const result = await getCompletedGoalsAction(circle.handle as string);
                        setCompletedGoalsData(result.goals || []);
                    } catch (err) {
                        console.error("Error fetching completed goals:", err);
                        setError("Failed to load completed goals.");
                    } finally {
                        setIsLoadingCompleted(false);
                    }
                } else if (initialGoalsData && completedGoalsData.length === 0) {
                    // If initialGoalsData was provided but resulted in empty completedGoalsData
                    setCompletedGoalsData(initialGoalsData.goals?.filter((g) => g.stage === "completed") || []);
                    setIsLoadingCompleted(false);
                } else {
                    setIsLoadingCompleted(false); // Already loaded
                }
            }
        };

        startTransition(() => {
            fetchGoals();
        });
        // Depend on activeTab and circle.handle. initialGoalsData is used for initial setup.
        // Not including activeGoalsData/completedGoalsData in deps to avoid re-fetching when they are set.
    }, [activeTab, circle.handle, initialGoalsData]);

    const displayedGoals = useMemo(() => {
        if (activeTab === "active") {
            return activeGoalsData;
        } else {
            // activeTab === "completed"
            return completedGoalsData;
        }
    }, [activeGoalsData, completedGoalsData, activeTab]);

    const handleCreateGoal = () => {
        // targetDate removed for dialog usage
        setIsCreateGoalDialogOpen(true);
    };

    const handleCreateGoalSuccess = (data: { id?: string; circleHandle?: string }) => {
        setIsCreateGoalDialogOpen(false);
        router.refresh();
        if (data.id && data.circleHandle) {
            router.push(`/circles/${data.circleHandle}/goals/${data.id}`);
        } else if (data.id) {
            // Fallback if circleHandle is somehow not passed, though it should be from GoalForm
            router.push(`/circles/${circle.handle}/goals/${data.id}`);
        }
    };

    // Helper function to render the timeline content for a given set of goals
    const renderTimelineContent = (goalsToRender: GoalDisplay[], tab: "active" | "completed") => {
        const { dated: groupedDatedGoals, undated: undatedGoals } = groupGoalsByDate(
            goalsToRender,
            tab === "completed" ? "desc" : "asc",
        );
        const sortedYearKeys = Object.keys(groupedDatedGoals).sort((a, b) => {
            const yearA = parseInt(a);
            const yearB = parseInt(b);
            return tab === "completed" ? yearB - yearA : yearA - yearB;
        });

        const hasDatedGoals = sortedYearKeys.length > 0;
        const hasUndatedGoals = undatedGoals.length > 0;

        if (!hasDatedGoals && !hasUndatedGoals) {
            return <div className="p-8 text-center text-muted-foreground">No {tab} goals found.</div>;
        }

        return (
            <div className="relative pl-0 pr-4">
                {" "}
                {/* Increased left padding */}
                {/* Render Dated Goals */}
                {sortedYearKeys.map((year) => (
                    <div key={`${tab}-${year}`} className="relative">
                        <div className="ml-12">
                            {/* Month Sections */}
                            {Object.entries(groupedDatedGoals[year])
                                // Sort months numerically
                                .sort(([monthA], [monthB]) => {
                                    const monthNumA = parseInt(monthA);
                                    const monthNumB = parseInt(monthB);
                                    return tab === "completed" ? monthNumB - monthNumA : monthNumA - monthNumB;
                                })
                                .map(([month, monthGoals]) => {
                                    const monthNumber = parseInt(month);
                                    const monthDate = new Date(parseInt(year), monthNumber); // Date for formatting
                                    return (
                                        <div key={`${tab}-${year}-${monthNumber}`} className="relative mb-4 pl-0">
                                            {/* Color Bar (position relative to month header now) */}
                                            <div
                                                className={cn(
                                                    "absolute -left-[28px] top-1 h-full w-[4px] rounded-full",
                                                    monthColorClasses[monthNumber] || "bg-gray-400", // Use month number index
                                                )}
                                            ></div>

                                            {/* Month and Year Header */}
                                            <div className="header mb-3 text-lg font-semibold text-foreground">
                                                {format(monthDate, "MMMM yyyy")}
                                            </div>

                                            {/* Goal Cards Grid */}
                                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                {monthGoals.map((goal) => (
                                                    <GoalCard
                                                        key={goal._id}
                                                        goal={goal}
                                                        circleHandle={circle.handle!}
                                                        canCreateTask={permissions.canCreateTask}
                                                        tasksModuleEnabled={tasksModuleEnabled ?? false} // Ensure boolean
                                                        router={router}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                ))}
                {/* Render Undated Goals Section */}
                {hasUndatedGoals && (
                    <div key={`${tab}-no_date_section`} className="relative mb-8 mt-8">
                        <div className="ml-12 grid grid-cols-1 gap-4 md:grid-cols-2">
                            {undatedGoals.map((goal) => (
                                <GoalCard
                                    key={goal._id}
                                    goal={goal}
                                    circleHandle={circle.handle!}
                                    canCreateTask={permissions.canCreateTask}
                                    tasksModuleEnabled={tasksModuleEnabled ?? false} // Ensure boolean
                                    router={router}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const isLoadingCurrentTab =
        (activeTab === "active" && isLoadingActive) || (activeTab === "completed" && isLoadingCompleted);

    if (isLoadingCurrentTab && displayedGoals.length === 0) {
        // Show loader only if no data yet for the tab
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // We might not want to show a global error if one tab fails but the other has data.
    // Error handling can be per-tab or a general message if both fail.
    if (error && displayedGoals.length === 0) {
        // Show error if no data for current tab and error exists
        return <div className="p-8 text-center text-red-600">{error}</div>;
    }

    return (
        <div className="flex w-full flex-col items-center">
            <div className="w-full max-w-[1100px]">
                <Tabs
                    value={activeTab}
                    onValueChange={(value) => setActiveTab(value as "active" | "completed")}
                    className="w-full" // Removed px-4, handled by inner container
                >
                    {/* Header Row: Tabs on Left, Button on Right */}
                    <div className="mb-4 flex items-center justify-between px-4 pt-4">
                        <TabsList className="bg-transparent p-0">
                            {" "}
                            {/* Removed grid/width/centering, made background transparent */}
                            <TabsTrigger
                                value="active"
                                className="mr-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none" // Subtle styling
                            >
                                Active
                            </TabsTrigger>
                            <TabsTrigger
                                value="completed"
                                className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none" // Subtle styling
                            >
                                Completed
                            </TabsTrigger>
                        </TabsList>

                        {/* Create Goal Button */}
                        {canCreateGoal && (
                            <Button onClick={() => handleCreateGoal()} size="sm">
                                <Plus className="mr-1.5 h-4 w-4" /> Create Goal
                            </Button>
                        )}
                    </div>

                    {/* Tab Content */}
                    <TabsContent value="active" className="mt-0">
                        {renderTimelineContent(displayedGoals, "active")}
                    </TabsContent>
                    <TabsContent value="completed" className="mt-0">
                        {renderTimelineContent(displayedGoals, "completed")}
                    </TabsContent>
                </Tabs>

                {canCreateGoal && (
                    <CreateGoalDialog
                        isOpen={isCreateGoalDialogOpen}
                        onOpenChange={setIsCreateGoalDialogOpen}
                        onSuccess={handleCreateGoalSuccess}
                        itemKey="goal" // Assuming 'goal' is the correct key for CreatableItemDetail
                        initialSelectedCircleId={circle._id} // Pass current circle ID
                        // proposal prop is not needed here
                    />
                )}
            </div>
        </div>
    );
};

export default GoalTimeline;
