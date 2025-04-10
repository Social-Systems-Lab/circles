"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    UniqueIdentifier, // Added
    useDraggable, // Added
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, GripVertical } from "lucide-react";
import { Circle, TaskDisplay } from "@/models/models";
import {
    getTasksForPrioritizationAction,
    getUserRankedListAction,
    saveUserRankedListAction,
} from "@/app/circles/[handle]/tasks/actions";
import { useToast } from "@/components/ui/use-toast";

interface TaskPrioritizationModalProps {
    circle: Circle;
    isOpen: boolean;
    onClose: () => void;
}

// Draggable Item for Unranked List
const DraggableTaskItem = ({ task, id }: { task: TaskDisplay; id: string }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });
    const style = transform
        ? {
              transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
          }
        : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className="mb-2 flex cursor-grab touch-none items-center rounded border bg-gray-100 p-3 shadow-sm"
        >
            <span className="flex-grow">{task.title}</span>
        </div>
    );
};

// Sortable Item Component for Ranked List
const SortableTaskItem = ({ task, id }: { task: TaskDisplay; id: string }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : "auto", // Ensure dragging item is on top
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            className="mb-2 flex items-center rounded border bg-white p-3 shadow-sm"
        >
            <button {...listeners} className="mr-2 cursor-grab touch-none p-1">
                <GripVertical className="h-5 w-5 text-gray-400" />
            </button>
            <span className="flex-grow">{task.title}</span>
            {/* Add more task details if needed */}
        </div>
    );
};

const TaskPrioritizationModal: React.FC<TaskPrioritizationModalProps> = ({ circle, isOpen, onClose }) => {
    const [rankedTasks, setRankedTasks] = useState<TaskDisplay[]>([]);
    const [unrankedTasks, setUnrankedTasks] = useState<TaskDisplay[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(null); // For drag overlay
    const { toast } = useToast();

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    useEffect(() => {
        if (isOpen) {
            fetchData();
        } else {
            // Reset state when closed
            setIsLoading(true);
            setRankedTasks([]);
            setUnrankedTasks([]);
        }
    }, [isOpen, circle.handle]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [allActiveTasksResult, userRankingResult] = await Promise.all([
                getTasksForPrioritizationAction(circle.handle!),
                getUserRankedListAction(circle.handle!),
            ]);

            const allActiveTasks = allActiveTasksResult || [];
            const userRanking = userRankingResult?.list || [];

            const taskMap = new Map(allActiveTasks.map((task) => [task._id!.toString(), task]));

            const currentRanked: TaskDisplay[] = [];
            const currentUnranked: TaskDisplay[] = [];
            const rankedIds = new Set<string>();

            userRanking.forEach((taskId) => {
                const task = taskMap.get(taskId);
                if (task) {
                    currentRanked.push(task);
                    rankedIds.add(taskId);
                }
            });

            allActiveTasks.forEach((task) => {
                if (!rankedIds.has(task._id!.toString())) {
                    currentUnranked.push(task);
                }
            });

            setRankedTasks(currentRanked);
            setUnrankedTasks(currentUnranked);
        } catch (error) {
            console.error("Error fetching prioritization data:", error);
            toast({ title: "Error", description: "Could not load tasks for prioritization.", variant: "destructive" });
            onClose();
        } finally {
            setIsLoading(false);
        }
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveId(null);
        const { active, over } = event;

        if (!over) return; // Dropped outside a droppable area

        const activeIdStr = active.id.toString();
        const overIdStr = over.id.toString();

        const isActiveInUnranked = unrankedTasks.some((task) => task._id!.toString() === activeIdStr);
        const isActiveInRanked = rankedTasks.some((task) => task._id!.toString() === activeIdStr);
        const isOverRankedList =
            rankedTasks.some((task) => task._id!.toString() === overIdStr) || over.id === "ranked-column"; // Check if over ranked item or the column itself

        // Case 1: Reordering within Ranked list
        if (isActiveInRanked && isOverRankedList && activeIdStr !== overIdStr) {
            setRankedTasks((items) => {
                const oldIndex = items.findIndex((item) => item._id!.toString() === activeIdStr);
                // If dropping over the column ID, append to end, otherwise find index
                const newIndex =
                    over.id === "ranked-column"
                        ? items.length
                        : items.findIndex((item) => item._id!.toString() === overIdStr);
                // Prevent dropping onto itself in edge cases
                if (oldIndex === newIndex) return items;
                return arrayMove(items, oldIndex, newIndex);
            });
        }
        // Case 2: Moving from Unranked to Ranked list
        else if (isActiveInUnranked && isOverRankedList) {
            const taskToMove = unrankedTasks.find((task) => task._id!.toString() === activeIdStr);
            if (taskToMove) {
                setUnrankedTasks((items) => items.filter((item) => item._id!.toString() !== activeIdStr));
                setRankedTasks((items) => {
                    // If dropping over the column ID, append to end, otherwise find index
                    const newIndex =
                        over.id === "ranked-column"
                            ? items.length
                            : items.findIndex((item) => item._id!.toString() === overIdStr);
                    // Insert the item at the calculated index
                    return [...items.slice(0, newIndex), taskToMove, ...items.slice(newIndex)];
                });
            }
        }
        // TODO: Case 3: Moving from Ranked back to Unranked (if desired)
    };

    const handleSave = async () => {
        if (unrankedTasks.length > 0) {
            toast({
                title: "Incomplete Ranking",
                description: "Please rank all tasks before saving.",
                variant: "destructive",
            });
            return;
        }

        setIsSaving(true);
        try {
            const rankedItemIds = rankedTasks.map((task) => task._id!.toString());
            const formData = new FormData();
            rankedItemIds.forEach((id) => formData.append("rankedItemIds", id));
            const result = await saveUserRankedListAction(circle.handle!, formData);

            if (result.success) {
                toast({ title: "Success", description: "Task ranking saved." });
                onClose();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to save ranking.",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Error saving ranking:", error);
            toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const rankedTaskIds = useMemo(() => rankedTasks.map((t) => t._id!.toString()), [rankedTasks]);
    const unrankedTaskIds = useMemo(() => unrankedTasks.map((t) => t._id!.toString()), [unrankedTasks]); // Needed for DndContext if unranked were draggable targets
    const activeTask = useMemo(
        () =>
            rankedTasks.find((t) => t._id!.toString() === activeId) ||
            unrankedTasks.find((t) => t._id!.toString() === activeId),
        [activeId, rankedTasks, unrankedTasks],
    );

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Prioritize Tasks for {circle.name}</DialogTitle>
                    <DialogDescription>
                        Drag and drop tasks to set their priority order. All active tasks must be ranked.
                    </DialogDescription>
                </DialogHeader>
                {isLoading ? (
                    <div className="flex h-40 items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        <div className="mt-4 grid max-h-[60vh] grid-cols-2 gap-4 overflow-y-auto p-1">
                            {/* Unranked Column */}
                            <div>
                                <h3 className="mb-2 border-b pb-1 font-semibold">Unranked ({unrankedTasks.length})</h3>
                                {unrankedTasks.length === 0 && (
                                    <p className="text-sm italic text-muted-foreground">All tasks ranked!</p>
                                )}
                                {/* Make unranked items draggable */}
                                {unrankedTasks.map((task) => (
                                    <DraggableTaskItem
                                        key={task._id!.toString()}
                                        id={task._id!.toString()}
                                        task={task}
                                    />
                                ))}
                            </div>

                            {/* Ranked Column - Use SortableContext */}
                            {/* Add an ID to the container div to act as a droppable target */}
                            <div id="ranked-column">
                                <h3 className="mb-2 border-b pb-1 font-semibold">Ranked ({rankedTasks.length})</h3>
                                <SortableContext items={rankedTaskIds} strategy={verticalListSortingStrategy}>
                                    {rankedTasks.map((task) => (
                                        <SortableTaskItem
                                            key={task._id!.toString()}
                                            id={task._id!.toString()}
                                            task={task}
                                        />
                                    ))}
                                    {/* Add a placeholder if the list is empty to allow dropping */}
                                    {rankedTasks.length === 0 && (
                                        <div className="flex h-20 items-center justify-center rounded border border-dashed border-gray-300 text-sm text-muted-foreground">
                                            Drag unranked tasks here
                                        </div>
                                    )}
                                </SortableContext>
                            </div>
                        </div>
                        <DragOverlay>
                            {activeId && activeTask ? (
                                // Render the item being dragged
                                <div className="mb-2 flex items-center rounded border bg-white p-3 opacity-90 shadow-lg">
                                    <GripVertical className="mr-2 h-5 w-5 text-gray-400" />
                                    <span className="flex-grow">{activeTask.title}</span>
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                )}
                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isLoading || isSaving || unrankedTasks.length > 0}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save Ranking
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default TaskPrioritizationModal;
