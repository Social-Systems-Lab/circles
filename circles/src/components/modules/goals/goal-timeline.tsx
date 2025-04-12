// src/components/modules/goals/goal-timeline.tsx
"use client";

import React, { useState, useEffect } from "react";
import { GoalDisplay, Circle, GoalPermissions } from "@/models/models";
import { getGoalsAction } from "@/app/circles/[handle]/goals/actions";
import { Loader2, CalendarIcon } from "lucide-react"; // Added CalendarIcon
import { Card, CardContent } from "@/components/ui/card"; // Use Card components
import Image from "next/image";
import Link from "next/link";
import { format } from "date-fns"; // For formatting dates

interface GoalTimelineProps {
    circle: Circle;
    permissions: GoalPermissions; // Keep permissions for potential future use (e.g., actions on cards)
    initialGoalsData?: { goals: GoalDisplay[] }; // Allow passing initial data
}

// Helper function to group goals by year and month based on targetDate
const groupGoalsByDate = (goals: GoalDisplay[]) => {
    const grouped: Record<string, Record<string, GoalDisplay[]>> = {};
    // Ensure goals with targetDate are processed and sorted
    goals
        .filter((goal) => goal.targetDate)
        .sort((a, b) => new Date(a.targetDate!).getTime() - new Date(b.targetDate!).getTime())
        .forEach((goal) => {
            const date = new Date(goal.targetDate!);
            const year = date.getFullYear().toString();
            // Use 'short' month format (e.g., Jan, Feb) and uppercase
            const month = date.toLocaleString("default", { month: "short" }).toUpperCase();

            if (!grouped[year]) {
                grouped[year] = {};
            }
            if (!grouped[year][month]) {
                grouped[year][month] = [];
            }
            grouped[year][month].push(goal);
        });
    return grouped;
};

const GoalTimeline: React.FC<GoalTimelineProps> = ({ circle, permissions, initialGoalsData }) => {
    const [goals, setGoals] = useState<GoalDisplay[]>(initialGoalsData?.goals || []);
    const [isLoading, setIsLoading] = useState(!initialGoalsData);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Fetch data only if initial data wasn't provided
        if (!initialGoalsData) {
            const fetchGoals = async () => {
                setIsLoading(true);
                setError(null);
                try {
                    // Note: getGoalsAction fetches all goals. We filter/sort client-side.
                    // Ideally, a dedicated backend endpoint would fetch goals sorted by targetDate.
                    const result = await getGoalsAction(circle.handle!);
                    const goalsWithTargetDate = result.goals.filter((g) => g.targetDate);
                    setGoals(goalsWithTargetDate); // Set only goals with target dates
                } catch (err) {
                    console.error("Error fetching goals for timeline:", err);
                    setError("Failed to load goals.");
                } finally {
                    setIsLoading(false);
                }
            };
            fetchGoals();
        } else {
            // If initial data is provided, filter it immediately
            setGoals(initialGoalsData.goals.filter((g) => g.targetDate));
            setIsLoading(false);
        }
    }, [circle.handle, initialGoalsData]); // Rerun if circle handle or initial data changes

    // Group goals after fetching/setting state
    const groupedGoals = groupGoalsByDate(goals);
    const sortedYears = Object.keys(groupedGoals).sort((a, b) => parseInt(a) - parseInt(b));

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

    if (goals.length === 0) {
        return <div className="p-8 text-center text-muted-foreground">No goals with target dates found.</div>;
    }

    return (
        <div className="relative py-6 pl-12 pr-4">
            {" "}
            {/* Increased left padding for timeline labels */}
            {/* Vertical Line */}
            <div className="absolute bottom-0 left-6 top-0 w-0.5 bg-gray-300"></div>
            {sortedYears.map((year, yearIndex) => (
                <div key={year} className="relative mb-8">
                    {/* Year Marker */}
                    <div className="absolute left-0 top-0 z-10 -ml-[2px] mt-1 flex items-center">
                        {/* Larger dot for year */}
                        <div className="h-4 w-4 rounded-full bg-primary ring-4 ring-background"></div>
                        <span className="ml-4 text-sm font-semibold text-primary">{year}</span>
                    </div>

                    <div className="ml-12 mt-10">
                        {" "}
                        {/* Indent content further */}
                        {Object.entries(groupedGoals[year]).map(([month, monthGoals], monthIndex) => (
                            <div key={month} className="relative mb-6 pl-8">
                                {" "}
                                {/* Increased padding for month label */}
                                {/* Month Marker & Line Segment */}
                                <div className="absolute -left-[22px] top-1 h-full">
                                    {/* Smaller dot for month */}
                                    <div className="absolute left-[1px] top-0 h-2.5 w-2.5 rounded-full bg-secondary ring-2 ring-background"></div>
                                    {/* TODO: Add ellipsis/dashed line for gaps if needed */}
                                </div>
                                {/* Position month label further left */}
                                <span className="absolute -left-8 top-0 text-xs font-medium text-muted-foreground">
                                    {month}
                                </span>
                                {/* Goal Cards for the month */}
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    {monthGoals.map((goal) => (
                                        <Link
                                            key={goal._id}
                                            href={`/circles/${circle.handle}/goals/${goal._id}`}
                                            className="group block"
                                        >
                                            <Card className="h-full transition-shadow duration-200 ease-in-out hover:shadow-lg">
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
                                                        {" "}
                                                        {/* Ensure text wraps */}
                                                        <h4 className="mb-1 truncate font-semibold group-hover:text-primary">
                                                            {goal.title}
                                                        </h4>
                                                        <p className="mb-2 line-clamp-3 text-sm text-muted-foreground">
                                                            {goal.description}
                                                        </p>
                                                        {/* Display Target Date */}
                                                        <div className="flex items-center text-xs text-muted-foreground">
                                                            <CalendarIcon className="mr-1 h-3 w-3" />
                                                            Target: {format(new Date(goal.targetDate!), "MMM d, yyyy")}
                                                        </div>
                                                        {/* Add other details like stage if needed */}
                                                        {/* <Badge variant="outline" className="mt-2 text-xs">{goal.stage}</Badge> */}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default GoalTimeline;
