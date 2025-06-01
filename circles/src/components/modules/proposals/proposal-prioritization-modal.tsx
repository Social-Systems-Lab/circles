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
import { Loader2, GripVertical, X } from "lucide-react";
import { Circle, ProposalDisplay } from "@/models/models"; // Assuming ProposalDisplay exists
import {
    // Placeholder actions - to be created/updated
    getProposalsForRankingAction,
    getUserRankedProposalsAction,
    saveUserRankedProposalsAction,
} from "@/app/circles/[handle]/proposals/actions";
import { useToast } from "@/components/ui/use-toast";

// --- Child Components ---

const ProposalItemDisplay = ({ proposal }: { proposal: ProposalDisplay }) => (
    <div className="flex cursor-grab touch-none items-center">
        <span className="flex-grow">{proposal.name}</span>
    </div>
);

interface SortableProposalItemProps {
    proposal: ProposalDisplay;
    id: string;
    rank?: number;
    isRanked: boolean;
}

const SortableProposalItem = ({ proposal, id, rank, isRanked }: SortableProposalItemProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: id,
        data: { proposal, type: isRanked ? "ranked" : "unranked" },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : "auto",
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`mb-2 flex items-center rounded border bg-white p-3 shadow-sm`}
        >
            {isRanked && rank !== undefined && (
                <span className="mr-3 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-muted text-xs font-semibold text-muted-foreground">
                    {rank}
                </span>
            )}
            <div className="flex-grow">
                <ProposalItemDisplay proposal={proposal} />
            </div>
        </div>
    );
};

const DroppableContainer = ({
    id,
    children,
    type,
    isComplete = false,
}: {
    id: string;
    children: React.ReactNode;
    type: string;
    isComplete?: boolean;
}) => {
    const { setNodeRef, isOver } = useDroppable({
        id: id,
        data: { type: type },
    });

    const completeClasses = isComplete && type === "ranked-container" ? "border-green-300 bg-green-50" : "";
    const highlightClass = isOver ? "border-blue-500 bg-blue-50" : "border-transparent";

    return (
        <div
            ref={setNodeRef}
            className={`h-full rounded border p-2 transition-colors duration-150 ${
                isComplete ? completeClasses : highlightClass
            }`}
        >
            {children}
        </div>
    );
};

// --- Main Modal Component ---

interface ProposalPrioritizationModalProps {
    circle: Circle;
    onClose: () => void;
}

const ProposalPrioritizationModal: React.FC<ProposalPrioritizationModalProps> = ({ circle, onClose }) => {
    const [rankedProposals, setRankedProposals] = useState<ProposalDisplay[]>([]);
    const [unrankedProposals, setUnrankedProposals] = useState<ProposalDisplay[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
    const [activeProposal, setActiveProposal] = useState<ProposalDisplay | null>(null);
    const [activeType, setActiveType] = useState<string | null>(null);
    const [showUnrankedWarning, setShowUnrankedWarning] = useState(false);
    const { toast } = useToast();

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

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
    }, [onClose]);

    const fetchData = async () => {
        setIsLoading(true);
        setShowUnrankedWarning(false);
        try {
            // Using placeholder actions
            const [allActiveProposalsResult, userRankingResult] = await Promise.all([
                getProposalsForRankingAction(circle.handle!),
                getUserRankedProposalsAction(circle.handle!, "proposals"),
            ]);
            const allActiveProposals: ProposalDisplay[] = allActiveProposalsResult || [];
            const userRanking: string[] = userRankingResult?.list || [];

            const proposalMap = new Map<string, ProposalDisplay>(
                allActiveProposals.map((proposal: ProposalDisplay) => [proposal._id!, proposal]),
            );

            const currentRanked: ProposalDisplay[] = [];
            const currentUnranked: ProposalDisplay[] = [];
            const rankedIds = new Set<string>();

            userRanking.forEach((proposalId: string) => {
                const proposal = proposalMap.get(proposalId);
                if (proposal) {
                    currentRanked.push(proposal);
                    rankedIds.add(proposalId); // proposalId is already a string
                }
            });

            allActiveProposals.forEach((proposal: ProposalDisplay) => {
                if (proposal._id && !rankedIds.has(proposal._id)) {
                    // Ensure proposal._id exists
                    currentUnranked.push(proposal);
                }
            });
            setRankedProposals(currentRanked);
            setUnrankedProposals(currentUnranked);
        } catch (error) {
            console.error("Error fetching prioritization data:", error);
            toast({
                title: "Error",
                description: "Could not load proposals for prioritization.",
                variant: "destructive",
            });
            onClose();
        } finally {
            setIsLoading(false);
        }
    };

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        setActiveId(active.id);
        setActiveProposal(active.data.current?.proposal || null);
        setActiveType(active.data.current?.type || null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        setActiveId(null);
        setActiveProposal(null);
        setActiveType(null);

        if (!over || !active.data.current?.proposal) return;

        const activeIdStr = active.id.toString();
        const overIdStr = over.id.toString();
        const proposalToMove = active.data.current.proposal as ProposalDisplay;
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

        const activeIndexRanked = rankedProposals.findIndex((p) => p._id!.toString() === activeIdStr);
        const activeIndexUnranked = unrankedProposals.findIndex((p) => p._id!.toString() === activeIdStr);

        let movedToRanked = false;

        if (typeOfActive === "ranked" && (isOverRankedItem || isOverRankedContainer)) {
            if (activeIndexRanked === -1) return;
            setRankedProposals((items) => {
                const overIndex = items.findIndex((item) => item._id!.toString() === overIdStr);
                const newIndex = overIndex !== -1 ? overIndex : items.length;
                return arrayMove(items, activeIndexRanked, newIndex);
            });
        } else if (typeOfActive === "unranked" && (isOverUnrankedItem || isOverUnrankedContainer)) {
            if (activeIndexUnranked === -1) return;
            setUnrankedProposals((items) => {
                const overIndex = items.findIndex((item) => item._id!.toString() === overIdStr);
                const newIndex = overIndex !== -1 ? overIndex : items.length;
                return arrayMove(items, activeIndexUnranked, newIndex);
            });
        } else if (typeOfActive === "unranked" && (isOverRankedItem || isOverRankedContainer)) {
            setUnrankedProposals((items) => items.filter((item) => item._id!.toString() !== activeIdStr));
            setRankedProposals((items) => {
                const overIndex = items.findIndex((item) => item._id!.toString() === overIdStr);
                const newIndex = overIndex !== -1 ? overIndex : items.length;
                return [...items.slice(0, newIndex), proposalToMove, ...items.slice(newIndex)];
            });
            movedToRanked = true;
        } else if (typeOfActive === "ranked" && (isOverUnrankedItem || isOverUnrankedContainer)) {
            setRankedProposals((items) => items.filter((item) => item._id!.toString() !== activeIdStr));
            setUnrankedProposals((items) => {
                const overIndex = items.findIndex((item) => item._id!.toString() === overIdStr);
                const newIndex = overIndex !== -1 ? overIndex : items.length;
                return [...items.slice(0, newIndex), proposalToMove, ...items.slice(newIndex)];
            });
        }

        if (movedToRanked && unrankedProposals.length - 1 === 0) {
            setShowUnrankedWarning(false);
        }
    };

    const handleSave = async () => {
        if (unrankedProposals.length > 0) {
            setShowUnrankedWarning(true);
            return;
        }

        setShowUnrankedWarning(false);
        setIsSaving(true);
        try {
            const rankedItemIds = rankedProposals.map((proposal) => proposal._id!.toString());
            const formData = new FormData();
            rankedItemIds.forEach((id) => formData.append("rankedItemIds", id));
            // Using placeholder action
            const result = await saveUserRankedProposalsAction(circle.handle!, "proposals", formData);
            if (result.success) {
                toast({ title: "Success", description: "Proposal ranking saved." });
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

    const rankedProposalIds = useMemo(() => rankedProposals.map((p) => p._id!.toString()), [rankedProposals]);
    const unrankedProposalIds = useMemo(() => unrankedProposals.map((p) => p._id!.toString()), [unrankedProposals]);

    const isComplete = !isLoading && unrankedProposals.length === 0 && rankedProposals.length > 0;
    return (
        <div
            className="formatted fixed inset-0 z-40 flex items-start justify-center bg-black/60 p-4 md:items-center"
            role="presentation"
        >
            <div
                className="relative z-50 mt-[50px] flex max-h-[calc(100vh-152px)] w-full max-w-3xl flex-col rounded-lg bg-background shadow-xl md:pt-0"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
                aria-describedby="modal-description"
            >
                <div className="relative flex items-start justify-between rounded-t p-4">
                    <div>
                        <div id="modal-title" className="header text-2xl font-semibold text-foreground">
                            Rank Proposals for {circle.name}
                        </div>
                        <p id="modal-description" className="mt-1 text-sm text-muted-foreground">
                            Drag proposals between lists or reorder within lists. All proposals must be in the Ranked
                            list to save.
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
                                <DroppableContainer id="unranked-column-droppable" type="unranked-container">
                                    <h3 className="sticky top-0 z-10 mb-2 flex items-center border-b bg-background/95 pb-1 font-semibold backdrop-blur supports-[backdrop-filter]:bg-background/60">
                                        <span>Unranked</span>
                                        <span
                                            className={`ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-xs font-semibold transition-colors ${
                                                showUnrankedWarning
                                                    ? "border-2 border-red-500 bg-red-100 text-red-700"
                                                    : "bg-muted text-muted-foreground"
                                            }`}
                                        >
                                            {unrankedProposals.length}
                                        </span>
                                    </h3>
                                    <div className="min-h-[100px] pt-1">
                                        <SortableContext
                                            items={unrankedProposalIds}
                                            strategy={verticalListSortingStrategy}
                                        >
                                            {unrankedProposals.length === 0 && activeType !== "ranked" && (
                                                <p className="p-4 text-center text-sm italic text-muted-foreground">
                                                    Drag ranked proposals here to unrank.
                                                </p>
                                            )}
                                            {unrankedProposals.map((proposal) => (
                                                <SortableProposalItem
                                                    key={proposal._id!.toString()}
                                                    id={proposal._id!.toString()}
                                                    proposal={proposal}
                                                    isRanked={false}
                                                />
                                            ))}
                                            {unrankedProposals.length === 0 && activeType === "ranked" && (
                                                <div className="flex h-20 items-center justify-center rounded border border-dashed border-gray-300 text-sm text-muted-foreground">
                                                    Drop here to unrank
                                                </div>
                                            )}
                                        </SortableContext>
                                    </div>
                                </DroppableContainer>

                                <DroppableContainer
                                    id="ranked-column-droppable"
                                    type="ranked-container"
                                    isComplete={isComplete}
                                >
                                    <h3 className="sticky top-0 z-10 mb-2 flex items-center border-b bg-background/95 pb-1 font-semibold backdrop-blur supports-[backdrop-filter]:bg-background/60">
                                        <span>Ranked</span>
                                        <span
                                            className={`ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-xs font-semibold transition-colors ${
                                                isComplete
                                                    ? "bg-green-600 text-white"
                                                    : "bg-muted text-muted-foreground"
                                            }`}
                                        >
                                            {rankedProposals.length}
                                        </span>
                                    </h3>
                                    <div className="min-h-[100px] pt-1">
                                        <SortableContext
                                            items={rankedProposalIds}
                                            strategy={verticalListSortingStrategy}
                                        >
                                            {rankedProposals.length === 0 && activeType !== "unranked" && (
                                                <p className="p-4 text-center text-sm italic text-muted-foreground">
                                                    Drag unranked proposals here.
                                                </p>
                                            )}
                                            {rankedProposals.map((proposal, index) => (
                                                <SortableProposalItem
                                                    key={proposal._id!.toString()}
                                                    id={proposal._id!.toString()}
                                                    proposal={proposal}
                                                    rank={index + 1}
                                                    isRanked={true}
                                                />
                                            ))}
                                            {rankedProposals.length === 0 && activeType === "unranked" && (
                                                <div className="flex h-20 items-center justify-center rounded border border-dashed border-gray-300 text-sm text-muted-foreground">
                                                    Drop here to rank
                                                </div>
                                            )}
                                        </SortableContext>
                                    </div>
                                </DroppableContainer>
                            </div>
                            <DragOverlay dropAnimation={null}>
                                {activeId && activeProposal ? (
                                    <div className="flex items-center rounded border bg-white p-3 opacity-90 shadow-lg">
                                        <div className="flex-grow">
                                            <ProposalItemDisplay proposal={activeProposal} />
                                        </div>
                                    </div>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    )}
                </div>

                <div className="rounded-b p-4">
                    {showUnrankedWarning && (
                        <p id="unranked-warning" className="mb-2 text-center text-sm font-medium text-red-600">
                            Please rank all proposals before saving. Drag remaining proposals to the Ranked list.
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

export default ProposalPrioritizationModal;
