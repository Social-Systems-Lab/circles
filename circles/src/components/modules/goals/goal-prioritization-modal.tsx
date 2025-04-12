// goal-prioritization-modal.tsx
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
import { Loader2, GripVertical, X } from "lucide-react"; // Removed CheckCircle2
import { Circle, GoalDisplay } from "@/models/models";
import {
    getGoalsForRankingAction,
    getUserRankedListAction,
    saveUserRankedListAction,
} from "@/app/circles/[handle]/goals/actions";
import { useToast } from "@/components/ui/use-toast";

// --- Child Components ---

// 1. GoalItemDisplay (Simplified: Always shows handle, consistent styling)
// Removed isOverlay prop
const GoalItemDisplay = ({ goal }: { goal: GoalDisplay }) => (
    <div
        // Removed conditional styling based on isOverlay
        // Added cursor-grab here as it's always the same look
        className="flex cursor-grab touch-none items-center"
    >
        {/* Handle always shown */}
        <span className="flex-grow">{goal.title}</span>
    </div>
);

// 2. SortableGoalItem (Handles combined look for ranked items)
interface SortableGoalItemProps {
    goal: GoalDisplay;
    id: string;
    rank?: number; // Optional: Only provided for ranked items
    isRanked: boolean; // Flag to know which list it belongs to
}

const SortableGoalItem = ({ goal, id, rank, isRanked }: SortableGoalItemProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: id,
        data: { goal, type: isRanked ? "ranked" : "unranked" },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : "auto",
    };

    return (
        // Outer div handles sorting logic, applies transform/transition, AND visual styling
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners} // Apply listeners here for the whole item
            // Combined styling for the item "box" (Req 2)
            className={`mb-2 flex items-center rounded border bg-white p-3 shadow-sm`}
        >
            {/* Conditionally render rank number (Req 2) */}
            {isRanked && rank !== undefined && (
                <span
                    // Adjusted styling for rank within the box
                    className="mr-3 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-muted text-xs font-semibold text-muted-foreground"
                >
                    {rank}
                </span>
            )}
            {/* Removed spacer for unranked items (Req 3) */}
            {/* Inner div contains the visual representation (now just the GoalItemDisplay) */}
            <div className="flex-grow">
                {/* Pass goal, no isOverlay needed (Req 4) */}
                <GoalItemDisplay goal={goal} />
            </div>
        </div>
    );
};

// 3. DroppableContainer (Added conditional styling for ranked "complete" state)
const DroppableContainer = ({
    id,
    children,
    type,
    isComplete = false, // Added prop for complete state styling
}: {
    id: string;
    children: React.ReactNode;
    type: string;
    isComplete?: boolean; // Optional prop
}) => {
    const { setNodeRef, isOver } = useDroppable({
        id: id,
        data: { type: type },
    });

    // Conditional classes for "complete" state (Req 6)
    const completeClasses = isComplete && type === "ranked-container" ? "border-green-300 bg-green-50" : "";
    const highlightClass = isOver ? "border-blue-500 bg-blue-50" : "border-transparent";

    return (
        <div
            ref={setNodeRef}
            className={`h-full rounded border p-2 transition-colors duration-150 ${
                isComplete ? completeClasses : highlightClass // Apply complete or highlight styles
            }`}
        >
            {children}
        </div>
    );
};

// --- Main Modal Component ---

interface GoalPrioritizationModalProps {
    circle: Circle;
    onClose: () => void;
}

const GoalPrioritizationModal: React.FC<GoalPrioritizationModalProps> = ({ circle, onClose }) => {
    const [rankedGoals, setRankedGoals] = useState<GoalDisplay[]>([]);
    const [unrankedGoals, setUnrankedGoals] = useState<GoalDisplay[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
    const [activeGoal, setActiveGoal] = useState<GoalDisplay | null>(null);
    const [activeType, setActiveType] = useState<string | null>(null);
    // State for showing unranked warning (Req 7)
    const [showUnrankedWarning, setShowUnrankedWarning] = useState(false);
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
        document.addEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "hidden";
        fetchData();

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "";
        };
        // Dependency array remains the same. Ensure `onClose` is stable in parent (See Req 1 notes).
    }, [onClose]);

    const fetchData = async () => {
        // Reset loading and warning state on fetch start
        setIsLoading(true);
        setShowUnrankedWarning(false);
        try {
            const [allActiveGoalsResult, userRankingResult] = await Promise.all([
                getGoalsForRankingAction(circle.handle!),
                getUserRankedListAction(circle.handle!),
            ]);
            const allActiveGoals = allActiveGoalsResult || [];
            const userRanking = userRankingResult?.list || [];
            const goalMap = new Map(allActiveGoals.map((goal) => [goal._id!.toString(), goal]));
            const currentRanked: GoalDisplay[] = [];
            const currentUnranked: GoalDisplay[] = [];
            const rankedIds = new Set<string>();
            userRanking.forEach((goalId) => {
                const goal = goalMap.get(goalId);
                if (goal) {
                    currentRanked.push(goal);
                    rankedIds.add(goalId);
                }
            });
            allActiveGoals.forEach((goal) => {
                if (!rankedIds.has(goal._id!.toString())) {
                    currentUnranked.push(goal);
                }
            });
            setRankedGoals(currentRanked);
            setUnrankedGoals(currentUnranked);
        } catch (error) {
            console.error("Error fetching prioritization data:", error);
            toast({
                title: "Error",
                description: "Could not load goals for prioritization.",
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
        setActiveGoal(active.data.current?.goal || null);
        setActiveType(active.data.current?.type || null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        setActiveId(null);
        setActiveGoal(null);
        setActiveType(null);

        if (!over || !active.data.current?.goal) return;

        const activeIdStr = active.id.toString();
        const overIdStr = over.id.toString();
        const goalToMove = active.data.current.goal as GoalDisplay;
        const typeOfActive = active.data.current.type;
        const typeOfOverItem = over.data.current?.type;
        const typeOfOverContainer = over.data.current?.type?.includes("container") ? over.data.current?.type : null;

        if (activeIdStr === overIdStr && !typeOfOverContainer) {
            return;
        }

        const isOverRankedItem = typeOfOverItem === "ranked";
        const isOverUnrankedItem = typeOfOverItem === "unranked";
        const isOverRankedContainer = typeOfOverContainer === "ranked-container";
        const isOverUnrankedContainer = typeOfOverContainer === "unranked-container";

        const activeIndexRanked = rankedGoals.findIndex((t) => t._id!.toString() === activeIdStr);
        const activeIndexUnranked = unrankedGoals.findIndex((t) => t._id!.toString() === activeIdStr);

        let movedToRanked = false; // Flag to check if warning should potentially be cleared

        // Moving within Ranked
        if (typeOfActive === "ranked" && (isOverRankedItem || isOverRankedContainer)) {
            if (activeIndexRanked === -1) return;
            setRankedGoals((items) => {
                const overIndex = items.findIndex((item) => item._id!.toString() === overIdStr);
                const newIndex = overIndex !== -1 ? overIndex : items.length;
                return arrayMove(items, activeIndexRanked, newIndex);
            });
        }
        // Moving within Unranked
        else if (typeOfActive === "unranked" && (isOverUnrankedItem || isOverUnrankedContainer)) {
            if (activeIndexUnranked === -1) return;
            setUnrankedGoals((items) => {
                const overIndex = items.findIndex((item) => item._id!.toString() === overIdStr);
                const newIndex = overIndex !== -1 ? overIndex : items.length;
                return arrayMove(items, activeIndexUnranked, newIndex);
            });
        }
        // Moving Unranked -> Ranked
        else if (typeOfActive === "unranked" && (isOverRankedItem || isOverRankedContainer)) {
            setUnrankedGoals((items) => items.filter((item) => item._id!.toString() !== activeIdStr));
            setRankedGoals((items) => {
                const overIndex = items.findIndex((item) => item._id!.toString() === overIdStr);
                const newIndex = overIndex !== -1 ? overIndex : items.length;
                return [...items.slice(0, newIndex), goalToMove, ...items.slice(newIndex)];
            });
            movedToRanked = true;
        }
        // Moving Ranked -> Unranked
        else if (typeOfActive === "ranked" && (isOverUnrankedItem || isOverUnrankedContainer)) {
            setRankedGoals((items) => items.filter((item) => item._id!.toString() !== activeIdStr));
            setUnrankedGoals((items) => {
                const overIndex = items.findIndex((item) => item._id!.toString() === overIdStr);
                const newIndex = overIndex !== -1 ? overIndex : items.length;
                return [...items.slice(0, newIndex), goalToMove, ...items.slice(newIndex)];
            });
        }

        // If an item was moved to ranked, check if the warning should be cleared (Req 7 logic)
        // We check the *next* state by simulating the removal of the moved item
        if (movedToRanked && unrankedGoals.length - 1 === 0) {
            setShowUnrankedWarning(false);
        }
    };

    // --- Save Handler ---
    const handleSave = async () => {
        // Check for unranked items and show warning instead of toast (Req 7)
        if (unrankedGoals.length > 0) {
            setShowUnrankedWarning(true);
            // Optionally, scroll the warning into view if needed, e.g.:
            // document.getElementById('unranked-warning')?.scrollIntoView({ behavior: 'smooth' });
            return; // Stop execution
        }

        // Hide warning if save proceeds
        setShowUnrankedWarning(false);
        setIsSaving(true);
        try {
            const rankedItemIds = rankedGoals.map((goal) => goal._id!.toString());
            const formData = new FormData();
            rankedItemIds.forEach((id) => formData.append("rankedItemIds", id));
            const result = await saveUserRankedListAction(circle.handle!, formData);
            if (result.success) {
                toast({ title: "Success", description: "Goal ranking saved." });
                onClose(); // Close modal on successful save
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
    const rankedGoalIds = useMemo(() => rankedGoals.map((t) => t._id!.toString()), [rankedGoals]);
    const unrankedGoalIds = useMemo(() => unrankedGoals.map((t) => t._id!.toString()), [unrankedGoals]);

    // Determine if the ranked list is "complete" (Req 6)
    const isComplete = !isLoading && unrankedGoals.length === 0 && rankedGoals.length > 0;
    return (
        <div
            className="formatted fixed inset-0 z-40 flex items-start justify-center bg-black/60 p-4 md:items-center"
            role="presentation"
            // Add onClick handler to the backdrop to close the modal
            // onClick={onClose}
        >
            <div
                className="relative z-50 mt-[50px] flex max-h-[calc(100vh-152px)] w-full max-w-3xl flex-col rounded-lg bg-background shadow-xl md:pt-0"
                // Prevent clicks inside the modal from closing it
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
                aria-describedby="modal-description"
            >
                {/* Header */}
                <div className="relative flex items-start justify-between rounded-t p-4">
                    <div>
                        <div id="modal-title" className="header text-2xl font-semibold text-foreground">
                            Rank Goals for {circle.name}
                        </div>
                        <p id="modal-description" className="mt-1 text-sm text-muted-foreground">
                            Drag goals between lists or reorder within lists. All goals must be in the Ranked list to
                            save.
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="absolute right-2 top-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label="Close modal"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Body (Scrollable) */}
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
                            <div className="grid grid-cols-2 gap-4 md:grid-cols-2">
                                {/* Unranked Column */}
                                <DroppableContainer id="unranked-column-droppable" type="unranked-container">
                                    <h3 className="sticky top-0 z-10 mb-2 flex items-center border-b bg-background/95 pb-1 font-semibold backdrop-blur supports-[backdrop-filter]:bg-background/60">
                                        <span>Unranked</span>
                                        {/* Unranked Badge (Req 5: Centering check, Req 7: Warning style) */}
                                        <span
                                            className={`ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-xs font-semibold transition-colors ${
                                                showUnrankedWarning
                                                    ? "border-2 border-red-500 bg-red-100 text-red-700" // Warning style (Req 7)
                                                    : "bg-muted text-muted-foreground" // Default style
                                            }`}
                                        >
                                            {unrankedGoals.length}
                                        </span>
                                    </h3>
                                    <div className="min-h-[100px] pt-1">
                                        <SortableContext items={unrankedGoalIds} strategy={verticalListSortingStrategy}>
                                            {unrankedGoals.length === 0 && activeType !== "ranked" && (
                                                <p className="p-4 text-center text-sm italic text-muted-foreground">
                                                    Drag ranked goals here to unrank.
                                                </p>
                                            )}
                                            {unrankedGoals.map((goal) => (
                                                <SortableGoalItem
                                                    key={goal._id!.toString()}
                                                    id={goal._id!.toString()}
                                                    goal={goal}
                                                    isRanked={false}
                                                />
                                            ))}
                                            {unrankedGoals.length === 0 && activeType === "ranked" && (
                                                <div className="flex h-20 items-center justify-center rounded border border-dashed border-gray-300 text-sm text-muted-foreground">
                                                    Drop here to unrank
                                                </div>
                                            )}
                                        </SortableContext>
                                    </div>
                                </DroppableContainer>

                                {/* Ranked Column */}
                                {/* Pass isComplete prop for styling (Req 6) */}
                                <DroppableContainer
                                    id="ranked-column-droppable"
                                    type="ranked-container"
                                    isComplete={isComplete}
                                >
                                    <h3 className="sticky top-0 z-10 mb-2 flex items-center border-b bg-background/95 pb-1 font-semibold backdrop-blur supports-[backdrop-filter]:bg-background/60">
                                        <span>Ranked</span>
                                        {/* Ranked Badge (Req 5: Centering check, Req 6: Complete style) */}
                                        <span
                                            className={`ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-xs font-semibold transition-colors ${
                                                isComplete
                                                    ? "bg-green-600 text-white" // Complete style (Req 6)
                                                    : "bg-muted text-muted-foreground" // Default style
                                            }`}
                                        >
                                            {rankedGoals.length}
                                        </span>
                                        {/* Removed CheckCircle2 icon (Req 6) */}
                                    </h3>
                                    <div className="min-h-[100px] pt-1">
                                        <SortableContext items={rankedGoalIds} strategy={verticalListSortingStrategy}>
                                            {rankedGoals.length === 0 && activeType !== "unranked" && (
                                                <p className="p-4 text-center text-sm italic text-muted-foreground">
                                                    Drag unranked goals here.
                                                </p>
                                            )}
                                            {rankedGoals.map((goal, index) => (
                                                <SortableGoalItem
                                                    key={goal._id!.toString()}
                                                    id={goal._id!.toString()}
                                                    goal={goal}
                                                    rank={index + 1}
                                                    isRanked={true}
                                                />
                                            ))}
                                            {rankedGoals.length === 0 && activeType === "unranked" && (
                                                <div className="flex h-20 items-center justify-center rounded border border-dashed border-gray-300 text-sm text-muted-foreground">
                                                    Drop here to rank
                                                </div>
                                            )}
                                        </SortableContext>
                                    </div>
                                </DroppableContainer>
                            </div>
                            {/* DragOverlay uses GoalItemDisplay without isOverlay (Req 4) */}
                            <DragOverlay dropAnimation={null}>
                                {activeId && activeGoal ? (
                                    <div className="flex items-center rounded border bg-white p-3 opacity-90 shadow-lg">
                                        <div className="flex-grow">
                                            <GoalItemDisplay goal={activeGoal} />
                                        </div>
                                    </div>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    )}
                </div>

                {/* Footer */}
                <div className="rounded-b p-4">
                    {/* Unranked Warning Text (Req 7) */}
                    {showUnrankedWarning && (
                        <p id="unranked-warning" className="mb-2 text-center text-sm font-medium text-red-600">
                            Please rank all goals before saving. Drag remaining goals to the Ranked list.
                        </p>
                    )}
                    <div className="flex items-center justify-end space-x-2">
                        <Button variant="outline" onClick={onClose} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={isLoading || isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save Ranking
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GoalPrioritizationModal;
