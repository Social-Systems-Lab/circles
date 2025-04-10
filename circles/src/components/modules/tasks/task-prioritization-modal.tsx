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
    // Removed useDraggable as we now use Sortable for both lists
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
import { Button } from "@/components/ui/button";
import { Loader2, GripVertical, X, CheckCircle2 } from "lucide-react"; // Added X and CheckCircle2
import { Circle, TaskDisplay } from "@/models/models";
import {
    getTasksForPrioritizationAction,
    getUserRankedListAction,
    saveUserRankedListAction,
} from "@/app/circles/[handle]/tasks/actions";
import { useToast } from "@/components/ui/use-toast";

// --- Child Components ---

// 1. TaskItemDisplay (Simplified: Renders the item's look, shows handle only in overlay)
const TaskItemDisplay = ({ task, isOverlay = false }: { task: TaskDisplay; isOverlay?: boolean }) => (
    <div
        className={`flex touch-none items-center rounded border bg-white p-3 shadow-sm ${
            isOverlay ? "opacity-90 shadow-lg" : "cursor-grab" // Keep cursor-grab for non-overlay
        }`}
    >
        {/* Handle only shown in overlay */}
        {isOverlay && <GripVertical className="mr-2 h-5 w-5 flex-shrink-0 text-gray-400" />}
        {/* Spacer for alignment when handle is not shown */}
        {!isOverlay && <div className="mr-2 h-5 w-5 flex-shrink-0"></div>}
        <span className="flex-grow">{task.title}</span>
    </div>
);

// 2. SortableTaskItem (Used for BOTH lists now)
interface SortableTaskItemProps {
    task: TaskDisplay;
    id: string;
    rank?: number; // Optional: Only provided for ranked items
    isRanked: boolean; // Flag to know which list it belongs to
}

const SortableTaskItem = ({ task, id, rank, isRanked }: SortableTaskItemProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: id,
        data: { task, type: isRanked ? "ranked" : "unranked" }, // Set type based on list
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : "auto",
    };

    return (
        // Outer div handles sorting logic and applies transform/transition
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners} // Apply listeners here for the whole item
            className="mb-2 flex items-center" // Use flex to align rank number and item
        >
            {/* 3. Conditionally render rank number */}
            {isRanked && rank !== undefined && (
                <span className="mr-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-muted text-xs font-semibold text-muted-foreground">
                    {rank}
                </span>
            )}
            {/* Add spacer for unranked items for alignment consistency */}
            {!isRanked && <div className="mr-2 h-5 w-5 flex-shrink-0"></div>}
            {/* Inner div contains the visual representation */}
            <div className="flex-grow">
                <TaskItemDisplay task={task} />
            </div>
        </div>
    );
};

// 3. DroppableContainer (No changes needed here, highlighting should improve with SortableContext)
const DroppableContainer = ({ id, children, type }: { id: string; children: React.ReactNode; type: string }) => {
    const { setNodeRef, isOver } = useDroppable({
        id: id,
        data: { type: type },
    });
    return (
        <div
            ref={setNodeRef}
            // 1. Highlight should now work more consistently when dragging over items
            // because both lists use SortableContext, improving dnd-kit's detection.
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
    const [activeType, setActiveType] = useState<string | null>(null); // 'ranked' or 'unranked'
    const { toast } = useToast();

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    // --- Effects and Data Fetching ---
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "hidden";
            fetchData(); // Fetch data when opened
        } else {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "";
            // Reset state when closed
            setIsLoading(true);
            setRankedTasks([]);
            setUnrankedTasks([]);
            setActiveId(null);
            setActiveTask(null);
            setActiveType(null);
        }
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "";
        };
    }, [isOpen, onClose]); // Removed circle.handle dependency to avoid refetch on minor prop change if only isOpen matters

    // Fetch data function (no changes needed)
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
        const { active } = event;
        setActiveId(active.id);
        setActiveTask(active.data.current?.task || null);
        setActiveType(active.data.current?.type || null); // Type is 'ranked' or 'unranked'
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        // Reset active state immediately
        setActiveId(null);
        setActiveTask(null);
        setActiveType(null);

        if (!over || !active.data.current?.task) return;

        const activeIdStr = active.id.toString();
        const overIdStr = over.id.toString();
        const taskToMove = active.data.current.task as TaskDisplay;
        const typeOfActive = active.data.current.type; // 'ranked' or 'unranked'
        // Determine the type of the target (item or container)
        const typeOfOverItem = over.data.current?.type; // 'ranked', 'unranked'
        const typeOfOverContainer = over.data.current?.type?.includes("container") ? over.data.current?.type : null; // 'ranked-container', 'unranked-container'

        // Prevent dropping onto self unless it's the only way to target a container
        if (
            activeIdStr === overIdStr &&
            !typeOfOverContainer // Allow dropping on container even if ID matches (e.g., last item)
        ) {
            return;
        }

        const isOverRankedItem = typeOfOverItem === "ranked";
        const isOverUnrankedItem = typeOfOverItem === "unranked";
        const isOverRankedContainer = typeOfOverContainer === "ranked-container";
        const isOverUnrankedContainer = typeOfOverContainer === "unranked-container";

        // Find current indices
        const activeIndexRanked = rankedTasks.findIndex((t) => t._id!.toString() === activeIdStr);
        const activeIndexUnranked = unrankedTasks.findIndex((t) => t._id!.toString() === activeIdStr);

        // Scenario 1: Moving within Ranked list
        if (typeOfActive === "ranked" && (isOverRankedItem || isOverRankedContainer)) {
            if (activeIndexRanked === -1) return; // Should not happen
            setRankedTasks((items) => {
                const overIndex = items.findIndex((item) => item._id!.toString() === overIdStr);
                // If dropped on container or non-existent item, move to end
                const newIndex = overIndex !== -1 ? overIndex : items.length;
                return arrayMove(items, activeIndexRanked, newIndex);
            });
        }
        // 5. Scenario 2: Moving within Unranked list
        else if (typeOfActive === "unranked" && (isOverUnrankedItem || isOverUnrankedContainer)) {
            if (activeIndexUnranked === -1) return; // Should not happen
            setUnrankedTasks((items) => {
                const overIndex = items.findIndex((item) => item._id!.toString() === overIdStr);
                const newIndex = overIndex !== -1 ? overIndex : items.length;
                return arrayMove(items, activeIndexUnranked, newIndex);
            });
        }
        // Scenario 3: Moving Unranked -> Ranked
        else if (typeOfActive === "unranked" && (isOverRankedItem || isOverRankedContainer)) {
            // Remove from unranked
            setUnrankedTasks((items) => items.filter((item) => item._id!.toString() !== activeIdStr));
            // Add to ranked
            setRankedTasks((items) => {
                const overIndex = items.findIndex((item) => item._id!.toString() === overIdStr);
                const newIndex = overIndex !== -1 ? overIndex : items.length;
                return [...items.slice(0, newIndex), taskToMove, ...items.slice(newIndex)];
            });
        }
        // Scenario 4: Moving Ranked -> Unranked
        else if (typeOfActive === "ranked" && (isOverUnrankedItem || isOverUnrankedContainer)) {
            // Remove from ranked
            setRankedTasks((items) => items.filter((item) => item._id!.toString() !== activeIdStr));
            // Add to unranked
            setUnrankedTasks((items) => {
                const overIndex = items.findIndex((item) => item._id!.toString() === overIdStr);
                const newIndex = overIndex !== -1 ? overIndex : items.length;
                return [...items.slice(0, newIndex), taskToMove, ...items.slice(newIndex)];
            });
        }
    };

    // --- Save Handler ---
    const handleSave = async () => {
        // 6. Check moved inside, show toast if needed
        if (unrankedTasks.length > 0) {
            toast({
                title: "Incomplete Ranking",
                description: `Please rank the remaining ${unrankedTasks.length} task${
                    unrankedTasks.length > 1 ? "s" : ""
                } before saving.`,
                variant: "destructive", // Use warning variant
            });
            return; // Stop execution
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
            toast({
                title: "Error",
                description: "An unexpected error occurred.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Memoize IDs for SortableContext
    const rankedTaskIds = useMemo(() => rankedTasks.map((t) => t._id!.toString()), [rankedTasks]);
    const unrankedTaskIds = useMemo(() => unrankedTasks.map((t) => t._id!.toString()), [unrankedTasks]);

    // --- Render Logic ---
    if (!isOpen) {
        return null;
    }

    return (
        <div
            className="formatted fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
            role="presentation"
        >
            <div
                className="relative z-50 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-background shadow-xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
                aria-describedby="modal-description"
            >
                <div className="relative flex items-start justify-between rounded-t p-4">
                    <div>
                        <div id="modal-title" className="header text-2xl font-semibold text-foreground">
                            Prioritize Tasks for {circle.name}
                        </div>
                        <p id="modal-description" className="mt-1 text-sm text-muted-foreground">
                            Drag tasks between lists or reorder within lists. All tasks must be in the Ranked list to
                            save.
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="absolute right-2 top-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" // Positioned top-right
                        aria-label="Close modal"
                    >
                        <X className="h-4 w-4" /> {/* Smaller icon */}
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
                                    <h3 className="sticky top-0 z-10 mb-2 flex items-center border-b bg-background/95 pb-1 font-semibold backdrop-blur supports-[backdrop-filter]:bg-background/60">
                                        <span>Unranked</span>
                                        {/* 4. Badge for count */}
                                        <span className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-muted px-1 text-xs font-semibold text-muted-foreground">
                                            {unrankedTasks.length}
                                        </span>
                                    </h3>
                                    <div className="min-h-[100px] pt-1">
                                        {/* 5. Use SortableContext for Unranked */}
                                        <SortableContext items={unrankedTaskIds} strategy={verticalListSortingStrategy}>
                                            {unrankedTasks.length === 0 &&
                                                activeType !== "unranked" && ( // Show placeholder only if not dragging from unranked
                                                    <p className="p-4 text-center text-sm italic text-muted-foreground">
                                                        Drag ranked tasks here to unrank.
                                                    </p>
                                                )}
                                            {unrankedTasks.map((task) => (
                                                <SortableTaskItem
                                                    key={task._id!.toString()}
                                                    id={task._id!.toString()}
                                                    task={task}
                                                    isRanked={false} // Indicate it's unranked
                                                />
                                            ))}
                                            {/* Placeholder when dragging ranked item over empty unranked list */}
                                            {unrankedTasks.length === 0 && activeType === "ranked" && (
                                                <div className="flex h-20 items-center justify-center rounded border border-dashed border-gray-300 text-sm text-muted-foreground">
                                                    Drop here to unrank
                                                </div>
                                            )}
                                        </SortableContext>
                                    </div>
                                </DroppableContainer>

                                {/* Ranked Column */}
                                <DroppableContainer id="ranked-column-droppable" type="ranked-container">
                                    <h3 className="sticky top-0 z-10 mb-2 flex items-center border-b bg-background/95 pb-1 font-semibold backdrop-blur supports-[backdrop-filter]:bg-background/60">
                                        <span>Ranked</span>
                                        {/* 4. Badge for count */}
                                        <span className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
                                            {rankedTasks.length}
                                        </span>
                                        {/* 8. Green checkmark when all ranked */}
                                        {unrankedTasks.length === 0 && rankedTasks.length > 0 && !isLoading && (
                                            <CheckCircle2 className="ml-2 h-5 w-5 text-green-600" />
                                        )}
                                    </h3>
                                    <div className="min-h-[100px] pt-1">
                                        <SortableContext items={rankedTaskIds} strategy={verticalListSortingStrategy}>
                                            {rankedTasks.length === 0 &&
                                                activeType !== "ranked" && ( // Show placeholder only if not dragging from ranked
                                                    <p className="p-4 text-center text-sm italic text-muted-foreground">
                                                        Drag unranked tasks here.
                                                    </p>
                                                )}
                                            {rankedTasks.map((task, index) => (
                                                <SortableTaskItem
                                                    key={task._id!.toString()}
                                                    id={task._id!.toString()}
                                                    task={task}
                                                    rank={index + 1} // Pass rank
                                                    isRanked={true} // Indicate it's ranked
                                                />
                                            ))}
                                            {/* Placeholder when dragging unranked item over empty ranked list */}
                                            {rankedTasks.length === 0 && activeType === "unranked" && (
                                                <div className="flex h-20 items-center justify-center rounded border border-dashed border-gray-300 text-sm text-muted-foreground">
                                                    Drop here to rank
                                                </div>
                                            )}
                                        </SortableContext>
                                    </div>
                                </DroppableContainer>
                            </div>
                            {/* DragOverlay now uses the simplified TaskItemDisplay */}
                            <DragOverlay dropAnimation={null}>
                                {activeId && activeTask ? <TaskItemDisplay task={activeTask} isOverlay /> : null}
                            </DragOverlay>
                        </DndContext>
                    )}
                </div>

                {/* 5. Footer */}
                <div className="flex items-center justify-end space-x-2 rounded-b p-4">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    {/* 6. Save button always enabled unless loading/saving */}
                    <Button onClick={handleSave} disabled={isLoading || isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save Ranking
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default TaskPrioritizationModal;
