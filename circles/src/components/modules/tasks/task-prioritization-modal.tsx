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
    UniqueIdentifier,
    useDraggable,
    useDroppable,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
// Removed Dialog imports
import { Button } from "@/components/ui/button";
import { Loader2, GripVertical, X } from "lucide-react"; // Added X for close button
import { Circle, TaskDisplay } from "@/models/models";
import {
    getTasksForPrioritizationAction,
    getUserRankedListAction,
    saveUserRankedListAction,
} from "@/app/circles/[handle]/tasks/actions";
import { useToast } from "@/components/ui/use-toast";

// --- Child Components (TaskItemDisplay, DraggableTaskItem, SortableTaskItem, DroppableContainer) ---
// These remain the same as in the previous version. I'll omit them here for brevity,
// but make sure you have the latest versions from the prior response.

// Item being displayed (common styling for items and overlay)
const TaskItemDisplay = ({
    task,
    isOverlay = false,
    isSortable = false, // Flag to conditionally render handle
}: {
    task: TaskDisplay;
    isOverlay?: boolean;
    isSortable?: boolean;
}) => (
    <div
        className={`flex touch-none items-center rounded border p-3 shadow-sm ${
            isOverlay
                ? "bg-white opacity-90 shadow-lg" // Overlay style
                : isSortable
                  ? "cursor-grab bg-white" // Sortable item style
                  : "cursor-grab bg-gray-100" // Draggable item style
        }`}
    >
        {(isSortable || isOverlay) && <GripVertical className="mr-2 h-5 w-5 flex-shrink-0 text-gray-400" />}
        {!isSortable && !isOverlay && <div className="mr-2 h-5 w-5 flex-shrink-0"></div>}
        <span className="flex-grow">{task.title}</span>
    </div>
);

// Draggable Item for Unranked List
const DraggableTaskItem = ({ task, id, isDragging }: { task: TaskDisplay; id: string; isDragging: boolean }) => {
    const { attributes, listeners, setNodeRef } = useDraggable({
        id: id,
        data: { task, type: "unranked" },
    });
    const style = { opacity: isDragging ? 0.2 : 1 };
    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="mb-2">
            <TaskItemDisplay task={task} isSortable={false} />
        </div>
    );
};

// Sortable Item Component for Ranked List
const SortableTaskItem = ({ task, id }: { task: TaskDisplay; id: string }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: id,
        data: { task, type: "ranked" },
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : "auto",
    };
    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="mb-2">
            <TaskItemDisplay task={task} isSortable={true} />
        </div>
    );
};

// Generic Droppable Container Component
const DroppableContainer = ({ id, children, type }: { id: string; children: React.ReactNode; type: string }) => {
    const { setNodeRef, isOver } = useDroppable({
        id: id,
        data: { type: type },
    });
    return (
        <div
            ref={setNodeRef}
            className={`h-full rounded border p-2 transition-colors duration-150 ${
                isOver ? "border-blue-500 bg-blue-50" : "border-transparent"
            }`}
        >
            {children}
        </div>
    );
};

// --- Main Modal Component ---

interface TaskPrioritizationModalProps {
    circle: Circle;
    isOpen: boolean;
    onClose: () => void;
}

const TaskPrioritizationModal: React.FC<TaskPrioritizationModalProps> = ({ circle, isOpen, onClose }) => {
    const [rankedTasks, setRankedTasks] = useState<TaskDisplay[]>([]);
    const [unrankedTasks, setUnrankedTasks] = useState<TaskDisplay[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
    const [activeTask, setActiveTask] = useState<TaskDisplay | null>(null);
    const [activeType, setActiveType] = useState<string | null>(null);
    const { toast } = useToast();

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    // --- Effects and Data Fetching ---
    // Add effect to handle Escape key press for closing
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener("keydown", handleKeyDown);
            // Optional: Prevent background scroll
            document.body.style.overflow = "hidden";
        } else {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = ""; // Restore scroll
        }
        // Cleanup listener and body style on unmount or when isOpen changes
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "";
        };
    }, [isOpen, onClose]);

    useEffect(() => {
        if (isOpen) {
            fetchData();
        } else {
            // Reset state when closed
            setIsLoading(true);
            setRankedTasks([]);
            setUnrankedTasks([]);
            setActiveId(null);
            setActiveTask(null);
            setActiveType(null);
        }
    }, [isOpen, circle.handle]); // Keep dependency array

    const fetchData = async () => {
        // ... (fetchData logic remains the same)
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
            toast({
                title: "Error",
                description: "Could not load tasks for prioritization.",
                variant: "destructive",
            });
            onClose();
        } finally {
            setIsLoading(false);
        }
    };

    // --- Drag and Drop Handlers ---
    const handleDragStart = (event: DragStartEvent) => {
        // ... (handleDragStart logic remains the same)
        const { active } = event;
        setActiveId(active.id);
        setActiveTask(active.data.current?.task || null);
        setActiveType(active.data.current?.type || null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        // ... (handleDragEnd logic remains the same)
        const { active, over } = event;
        setActiveId(null);
        setActiveTask(null);
        setActiveType(null);
        if (!over || !active.data.current?.task) return;
        const activeIdStr = active.id.toString();
        const overIdStr = over.id.toString();
        const taskToMove = active.data.current.task as TaskDisplay;
        const typeOfActive = active.data.current.type;
        const typeOfOver = over.data.current?.type;
        if (activeIdStr === overIdStr && typeOfOver !== "unranked-container" && typeOfOver !== "ranked-container")
            return; // Allow dropping on container even if ID matches (e.g., last item)

        const isOverRankedItem = typeOfOver === "ranked";
        const isOverRankedContainer = typeOfOver === "ranked-container";
        const isOverUnrankedContainer = typeOfOver === "unranked-container";

        if (typeOfActive === "ranked" && (isOverRankedItem || isOverRankedContainer)) {
            setRankedTasks((items) => {
                const oldIndex = items.findIndex((item) => item._id!.toString() === activeIdStr);
                let newIndex: number;
                if (isOverRankedItem && overIdStr !== activeIdStr) {
                    // Ensure not dropping on self
                    newIndex = items.findIndex((item) => item._id!.toString() === overIdStr);
                } else {
                    // Dropped on container or self (treat as end)
                    newIndex = items.length;
                }
                // arrayMove handles index adjustments correctly
                return arrayMove(items, oldIndex, newIndex);
            });
        } else if (typeOfActive === "unranked" && (isOverRankedItem || isOverRankedContainer)) {
            setUnrankedTasks((items) => items.filter((item) => item._id!.toString() !== activeIdStr));
            setRankedTasks((items) => {
                let newIndex: number;
                if (isOverRankedItem) {
                    newIndex = items.findIndex((item) => item._id!.toString() === overIdStr);
                } else {
                    newIndex = items.length;
                }
                return [...items.slice(0, newIndex), taskToMove, ...items.slice(newIndex)];
            });
        } else if (typeOfActive === "ranked" && isOverUnrankedContainer) {
            setRankedTasks((items) => items.filter((item) => item._id!.toString() !== activeIdStr));
            setUnrankedTasks((items) => [...items, taskToMove]);
        }
    };

    // --- Save Handler ---
    const handleSave = async () => {
        // ... (handleSave logic remains the same)
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

    // --- Render Logic ---
    if (!isOpen) {
        return null; // Don't render anything if not open
    }

    // Use portal? For modals, often better to render directly into body via portal
    // but for simplicity here, we render inline. If z-index issues arise, consider React Portals.

    return (
        // 1. Overlay: Fixed position, covers screen, centers content, closes on click
        <div
            className="formatted fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
            role="presentation"
        >
            {/* 2. Content Box: Relative position, stops click propagation, defines modal appearance */}
            <div
                className="relative z-50 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-background shadow-xl"
                onClick={(e) => e.stopPropagation()} // Prevent clicks inside from closing modal
                role="dialog" // ARIA role
                aria-modal="true" // ARIA attribute
                aria-labelledby="modal-title" // Link title for screen readers
                aria-describedby="modal-description" // Link description
            >
                {/* 3. Header */}
                <div className="flex items-start justify-between rounded-t border-b p-4">
                    <div>
                        <div id="modal-title" className="header text-2xl font-semibold text-foreground">
                            Prioritize Tasks for {circle.name}
                        </div>
                        <p id="modal-description" className="mt-1 text-sm text-muted-foreground">
                            Drag tasks between lists or reorder within Ranked. All tasks must be ranked to save.
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="ml-auto inline-flex items-center rounded-lg bg-transparent p-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="Close modal"
                    >
                        <X className="h-5 w-5" />
                    </Button>
                </div>

                {/* 4. Body (Scrollable) */}
                <div className="flex-grow overflow-y-auto p-4">
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
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                {/* Unranked Column */}
                                <DroppableContainer id="unranked-column-droppable" type="unranked-container">
                                    <h3 className="sticky top-0 z-10 mb-2 border-b bg-background/95 pb-1 font-semibold backdrop-blur supports-[backdrop-filter]:bg-background/60">
                                        Unranked ({unrankedTasks.length})
                                    </h3>
                                    <div className="min-h-[100px] pt-1">
                                        {" "}
                                        {/* Min height for drop zone */}
                                        {unrankedTasks.length === 0 && !activeId && (
                                            <p className="p-4 text-center text-sm italic text-muted-foreground">
                                                No unranked tasks.
                                            </p>
                                        )}
                                        {unrankedTasks.map((task) => (
                                            <DraggableTaskItem
                                                key={task._id!.toString()}
                                                id={task._id!.toString()}
                                                task={task}
                                                isDragging={activeId === task._id!.toString()}
                                            />
                                        ))}
                                        {unrankedTasks.length === 0 && activeType === "ranked" && (
                                            <div className="flex h-20 items-center justify-center rounded border border-dashed border-gray-300 text-sm text-muted-foreground">
                                                Drop here to unrank
                                            </div>
                                        )}
                                    </div>
                                </DroppableContainer>

                                {/* Ranked Column */}
                                <DroppableContainer id="ranked-column-droppable" type="ranked-container">
                                    <h3 className="sticky top-0 z-10 mb-2 border-b bg-background/95 pb-1 font-semibold backdrop-blur supports-[backdrop-filter]:bg-background/60">
                                        Ranked ({rankedTasks.length})
                                    </h3>
                                    <div className="min-h-[100px] pt-1">
                                        {" "}
                                        {/* Min height for drop zone */}
                                        <SortableContext items={rankedTaskIds} strategy={verticalListSortingStrategy}>
                                            {rankedTasks.map((task) => (
                                                <SortableTaskItem
                                                    key={task._id!.toString()}
                                                    id={task._id!.toString()}
                                                    task={task}
                                                />
                                            ))}
                                            {rankedTasks.length === 0 && activeType !== "ranked" && (
                                                <div className="flex h-20 items-center justify-center rounded border border-dashed border-gray-300 text-sm text-muted-foreground">
                                                    Drag unranked tasks here
                                                </div>
                                            )}
                                        </SortableContext>
                                    </div>
                                </DroppableContainer>
                            </div>
                            <DragOverlay dropAnimation={null}>
                                {activeId && activeTask ? (
                                    <TaskItemDisplay task={activeTask} isOverlay isSortable={activeType === "ranked"} />
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    )}
                </div>

                {/* 5. Footer */}
                <div className="flex items-center justify-end space-x-2 rounded-b border-t p-4">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isLoading || isSaving || unrankedTasks.length > 0}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save Ranking
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default TaskPrioritizationModal;
