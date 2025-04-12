// src/components/modules/goals/goal-timeline.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react"; // Added useMemo
import { GoalDisplay, Circle, GoalPermissions, GoalStage } from "@/models/models"; // Added GoalStage
import { getGoalsAction } from "@/app/circles/[handle]/goals/actions";
import { Loader2, CalendarIcon, Plus, Clock } from "lucide-react"; // Added Clock
import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";
import { format, parse } from "date-fns";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Import Tabs components

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
}

const GoalCard: React.FC<GoalCardProps> = ({ goal, circleHandle }) => {
    const isReview = goal.stage === "review";

    return (
        <Link key={goal._id} href={`/circles/${circleHandle}/goals/${goal._id}`} className="group block">
            <Card
                className={cn(
                    "h-full transition-shadow duration-200 ease-in-out hover:shadow-lg",
                    isReview && "border-dashed border-yellow-400 bg-yellow-50/30 opacity-75", // Muted styling for review
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
            </Card>
        </Link>
    );
};

// Helper function to group goals by year/month or into a 'no_date' category
// Now accepts a sort direction for dated goals
const groupGoalsByDate = (goals: GoalDisplay[], sortDirection: "asc" | "desc" = "asc") => {
    const datedGoals = goals
        .filter((goal) => goal.targetDate)
        .sort((a, b) => {
            const timeA = new Date(a.targetDate!).getTime();
            const timeB = new Date(b.targetDate!).getTime();
            return sortDirection === "asc" ? timeA - timeB : timeB - timeA; // Apply sort direction
        });
    // Sort undated goals by creation date descending (newest first)
    const undatedGoals = goals
        .filter((goal) => !goal.targetDate)
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

    const grouped: Record<string, Record<string, GoalDisplay[]>> = {};

    datedGoals.forEach((goal) => {
        const date = new Date(goal.targetDate!);
        const year = date.getFullYear().toString();
        const month = date.toLocaleString("default", { month: "short" }).toUpperCase();

        if (!grouped[year]) grouped[year] = {};
        if (!grouped[year][month]) grouped[year][month] = [];
        grouped[year][month].push(goal);
    });

    if (undatedGoals.length > 0) {
        grouped["no_date"] = { "Goals without Target Date": undatedGoals };
    }

    return grouped;
};

const GoalTimeline: React.FC<GoalTimelineProps> = ({ circle, permissions, initialGoalsData, canCreateGoal }) => {
    const [allGoals, setAllGoals] = useState<GoalDisplay[]>(initialGoalsData?.goals || []);
    const [isLoading, setIsLoading] = useState(!initialGoalsData);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"active" | "completed">("active"); // State for tabs
    const router = useRouter();

    useEffect(() => {
        if (!initialGoalsData) {
            const fetchGoals = async () => {
                setIsLoading(true);
                setError(null);
                try {
                    const result = await getGoalsAction(circle.handle!);
                    setAllGoals(result.goals);
                } catch (err) {
                    console.error("Error fetching goals for timeline:", err);
                    setError("Failed to load goals.");
                } finally {
                    setIsLoading(false);
                }
            };
            fetchGoals();
        } else {
            setAllGoals(initialGoalsData.goals);
            setIsLoading(false);
        }
    }, [circle.handle, initialGoalsData]);

    // Filter goals based on the active tab
    const displayedGoals = useMemo(() => {
        if (activeTab === "active") {
            return allGoals.filter((goal) => goal.stage !== "resolved");
        } else {
            // completed tab
            return allGoals.filter((goal) => goal.stage === "resolved");
        }
    }, [allGoals, activeTab]);

    // Group the *displayed* goals
    const groupedGoals = useMemo(
        () => groupGoalsByDate(displayedGoals, activeTab === "completed" ? "desc" : "asc"),
        [displayedGoals, activeTab],
    );
    const yearKeys = Object.keys(groupedGoals).filter((key) => key !== "no_date");
    const noDateGoals = groupedGoals["no_date"];
    // Sort years numerically, descending for completed tab
    const sortedYears = yearKeys.sort((a, b) => {
        const yearA = parseInt(a);
        const yearB = parseInt(b);
        return activeTab === "completed" ? yearB - yearA : yearA - yearB;
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }
    if (error) {
        return <div className="p-8 text-center text-red-600">{error}</div>;
    }

    const handleCreateGoal = (targetDate?: string) => {
        const url = `/circles/${circle.handle}/goals/create${targetDate ? `?targetDate=${targetDate}` : ""}`;
        router.push(url);
    };

    // Helper function to render the timeline content for a given set of goals
    const renderTimelineContent = (goalsToRender: GoalDisplay[], tab: "active" | "completed") => {
        const groupedData = groupGoalsByDate(goalsToRender, tab === "completed" ? "desc" : "asc");
        const sortedYearKeys = Object.keys(groupedData)
            .filter((key) => key !== "no_date")
            .sort((a, b) => {
                const yearA = parseInt(a);
                const yearB = parseInt(b);
                return tab === "completed" ? yearB - yearA : yearA - yearB;
            });
        const undatedData = groupedData["no_date"];

        const hasDatedGoals = sortedYearKeys.length > 0;
        const hasUndatedGoals = undatedData && Object.keys(undatedData).length > 0;

        if (!hasDatedGoals && !hasUndatedGoals) {
            return <div className="p-8 text-center text-muted-foreground">No {tab} goals found.</div>;
        }

        return (
            <div className="relative py-6 pl-12 pr-4">
                {hasDatedGoals && <div className="absolute bottom-0 left-6 top-0 w-0.5 bg-gray-300"></div>}
                {/* Render Dated Goals */}
                {sortedYearKeys.map((year) => (
                    <div key={`${tab}-${year}`} className="group/year relative mb-8">
                        <div className="absolute left-0 top-0 z-10 -ml-[2px] mt-1 flex items-center">
                            <div className="h-4 w-4 rounded-full bg-primary ring-4 ring-background"></div>
                            <span className="ml-4 text-sm font-semibold text-primary">{year}</span>
                            {canCreateGoal && tab === "active" && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="ml-2 h-6 w-6 opacity-0 transition-opacity group-hover/year:opacity-100"
                                    onClick={() => handleCreateGoal(`${year}-01-01`)}
                                    aria-label={`Create goal for ${year}`}
                                >
                                    {" "}
                                    <Plus className="h-4 w-4" />{" "}
                                </Button>
                            )}
                        </div>
                        <div className="ml-12 mt-10">
                            {Object.entries(groupedData[year])
                                .sort(([monthA], [monthB]) => {
                                    const dateA = parse(monthA, "MMM", new Date());
                                    const dateB = parse(monthB, "MMM", new Date());
                                    return tab === "completed"
                                        ? dateB.getMonth() - dateA.getMonth()
                                        : dateA.getMonth() - dateB.getMonth();
                                })
                                .map(([month, monthGoals]) => (
                                    <div key={`${tab}-${year}-${month}`} className="relative mb-6 pl-8">
                                        <div className="group/month absolute -left-[22px] top-1 h-full">
                                            <div className="absolute left-[1px] top-0 h-2.5 w-2.5 rounded-full bg-secondary ring-2 ring-background"></div>
                                            {canCreateGoal && tab === "active" && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="absolute -left-7 -top-1 h-6 w-6 opacity-0 transition-opacity group-hover/month:opacity-100"
                                                    onClick={() => {
                                                        const monthDate = parse(
                                                            `${month} ${year}`,
                                                            "MMM yyyy",
                                                            new Date(),
                                                        );
                                                        const targetDateStr = format(monthDate, "yyyy-MM-dd");
                                                        handleCreateGoal(targetDateStr);
                                                    }}
                                                    aria-label={`Create goal for ${month} ${year}`}
                                                >
                                                    {" "}
                                                    <Plus className="h-4 w-4" />{" "}
                                                </Button>
                                            )}
                                        </div>
                                        <span className="absolute -left-8 top-0 text-xs font-medium text-muted-foreground">
                                            {month}
                                        </span>
                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                            {monthGoals.map((goal) => (
                                                <GoalCard key={goal._id} goal={goal} circleHandle={circle.handle!} />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}
                {/* Render Undated Goals Section */}
                {undatedData &&
                    Object.entries(undatedData).map(([title, undatedMonthGoals]) => (
                        <div key={`${tab}-no_date_section`} className="group/undated relative mb-8">
                            <div className="mb-4 ml-12 flex items-center">
                                <h3 className="text-lg font-semibold text-muted-foreground">{title}</h3>
                                {canCreateGoal && tab === "active" && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="ml-2 h-6 w-6 opacity-0 transition-opacity group-hover/undated:opacity-100"
                                        onClick={() => handleCreateGoal()}
                                        aria-label={`Create goal without target date`}
                                    >
                                        {" "}
                                        <Plus className="h-4 w-4" />{" "}
                                    </Button>
                                )}
                            </div>
                            <div className="ml-12 grid grid-cols-1 gap-4 md:grid-cols-2">
                                {undatedMonthGoals.map((goal) => (
                                    <GoalCard key={goal._id} goal={goal} circleHandle={circle.handle!} />
                                ))}
                            </div>
                        </div>
                    ))}
            </div>
        );
    };

    return (
        <div className="flex w-full flex-col items-center">
            <div className="w-full max-w-[1100px]">
                {/* Top Create Button */}
                {canCreateGoal && (
                    <div className="mb-4 flex justify-end px-4 pt-4">
                        <Button onClick={() => handleCreateGoal()}>
                            <Plus className="mr-2 h-4 w-4" /> Create Goal
                        </Button>
                    </div>
                )}
                {/* Active/Completed Tabs */}
                <Tabs
                    value={activeTab}
                    onValueChange={(value) => setActiveTab(value as "active" | "completed")}
                    className="w-full px-4"
                >
                    <TabsList className="mx-auto mb-4 grid w-full grid-cols-2 md:w-1/2">
                        <TabsTrigger value="active">Active</TabsTrigger>
                        <TabsTrigger value="completed">Completed</TabsTrigger>
                    </TabsList>
                    <TabsContent value="active">
                        {renderTimelineContent(
                            displayedGoals.filter((g) => g.stage !== "resolved"),
                            "active",
                        )}
                    </TabsContent>
                    <TabsContent value="completed">
                        {renderTimelineContent(
                            displayedGoals.filter((g) => g.stage === "resolved"),
                            "completed",
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
};

export default GoalTimeline;
