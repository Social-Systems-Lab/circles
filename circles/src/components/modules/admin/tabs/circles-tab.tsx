"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { changeCircleModerationStatusAction, getEntitiesByType, deleteEntity } from "../actions";
import { Circle } from "@/models/models";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, RefreshCw, Search, MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSetAtom } from "jotai";
import { contentPreviewAtom } from "@/lib/data/atoms";
import { getCircleByIdAction } from "../actions";
import type { CircleModerationStatus } from "@/models/models";
import {
    getCircleLifecycleStatus,
    getCircleLifecycleStatusBadgeClassName,
    getCircleLifecycleStatusLabel,
    getCircleLifecycleTransitions,
    submitCircleLifecycleChange,
} from "../circle-lifecycle-ui";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

const getCircleLevel = (circle: Circle) =>
    circle.circleLevel || (circle.parentCircleId ? "profile_child" : "top_level");

const getCircleKindLabel = (circle: Circle) =>
    getCircleLevel(circle) === "profile_child" ? "Profile circle" : "Independent circle";

const getPublishStatus = (circle: Circle) => circle.publishStatus || "published";

const getPublishStatusLabel = (circle: Circle) => {
    const publishStatus = getPublishStatus(circle);

    return publishStatus === "draft"
        ? "Draft"
        : publishStatus === "pending_verification"
          ? "Pending verification"
          : "Published";
};

const getPublishStatusBadgeClassName = (circle: Circle) => {
    const publishStatus = getPublishStatus(circle);

    return publishStatus === "draft"
        ? "border-amber-200 bg-amber-100 text-amber-900"
        : publishStatus === "pending_verification"
          ? "border-sky-200 bg-sky-100 text-sky-900"
          : "border-emerald-200 bg-emerald-100 text-emerald-900";
};

export default function CirclesTab() {
    const [circles, setCircles] = useState<Circle[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [showPendingOnly, setShowPendingOnly] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [circleToDelete, setCircleToDelete] = useState<Circle | null>(null);
    const [moderationCircle, setModerationCircle] = useState<Circle | null>(null);
    const [moderationTarget, setModerationTarget] = useState<CircleModerationStatus | null>(null);
    const [moderationActionLabel, setModerationActionLabel] = useState("");
    const [moderationReason, setModerationReason] = useState("");
    const [moderationSubmitting, setModerationSubmitting] = useState(false);
    const { toast } = useToast();
    const setContentPreview = useSetAtom(contentPreviewAtom);

    useEffect(() => {
        fetchCircles();
    }, []);

    const fetchCircles = async () => {
        try {
            setLoading(true);
            const data = await getEntitiesByType("circle");
            setCircles(data as Circle[]);
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to fetch circles",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (circle: Circle) => {
        setCircleToDelete(circle);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!circleToDelete) return;

        try {
            const result = await deleteEntity(circleToDelete._id);

            if (result.success) {
                toast({
                    title: "Success",
                    description: `Circle "${circleToDelete.name}" has been deleted`,
                });
                // Remove from local state
                setCircles(circles.filter((c) => c._id !== circleToDelete._id));
            } else {
                toast({
                    title: "Error",
                    description: result.message,
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to delete circle",
                variant: "destructive",
            });
        } finally {
            setDeleteDialogOpen(false);
            setCircleToDelete(null);
        }
    };

    const openModerationDialog = (circle: Circle, status: CircleModerationStatus, label: string) => {
        setModerationCircle(circle);
        setModerationTarget(status);
        setModerationActionLabel(label);
        setModerationReason("");
    };

    const closeModerationDialog = () => {
        if (moderationSubmitting) return;
        setModerationCircle(null);
        setModerationTarget(null);
        setModerationReason("");
    };

    const confirmModerationChange = async () => {
        if (!moderationCircle || !moderationTarget || !moderationReason.trim()) return;
        setModerationSubmitting(true);
        try {
            const result = await submitCircleLifecycleChange(
                changeCircleModerationStatusAction,
                moderationCircle._id,
                moderationTarget,
                moderationReason,
            );
            if (!result.success) {
                toast({ title: "Lifecycle change failed", description: result.message, variant: "destructive" });
                return;
            }
            toast({ title: "Lifecycle updated", description: result.message });
            setModerationCircle(null);
            setModerationTarget(null);
            setModerationReason("");
            await fetchCircles();
        } catch (error) {
            toast({
                title: "Lifecycle change failed",
                description: error instanceof Error ? error.message : "The lifecycle change could not be completed.",
                variant: "destructive",
            });
        } finally {
            setModerationSubmitting(false);
        }
    };

    const pendingVerificationCount = circles.filter(
        (circle) => getPublishStatus(circle) === "pending_verification",
    ).length;

    const filteredCircles = circles.filter((circle) => {
        const matchesSearch =
            circle.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            circle.handle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            circle.description?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesPendingFilter = !showPendingOnly || getPublishStatus(circle) === "pending_verification";

        return matchesSearch && matchesPendingFilter;
    });

    const handlePreview = async (id: string) => {
        const circle = await getCircleByIdAction(id);
        setContentPreview({ type: "circle", content: circle });
    };

    return (
        <div className="space-y-4">
            <div className="mb-4 flex items-center justify-between">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search circles..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant={showPendingOnly ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowPendingOnly((current) => !current)}
                    >
                        Pending verification
                        <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs text-current">
                            {pendingVerificationCount}
                        </span>
                    </Button>
                    <Button variant="outline" size="sm" onClick={fetchCircles} disabled={loading}>
                        {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        <span className="ml-2">Refresh</span>
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <RefreshCw className="h-8 w-8 animate-spin" />
                </div>
            ) : (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Kind</TableHead>
                                <TableHead>Workflow</TableHead>
                                <TableHead>Lifecycle</TableHead>
                                <TableHead>Handle</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Members</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredCircles.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                                        {searchTerm
                                            ? "No circles found matching your search"
                                            : showPendingOnly
                                              ? "No circles pending verification"
                                              : "No circles found"}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredCircles.map((circle) => (
                                    <TableRow key={circle._id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                {circle.picture && (
                                                    <img
                                                        src={circle.picture.url}
                                                        alt={circle.name}
                                                        className="h-8 w-8 rounded-full object-cover"
                                                    />
                                                )}
                                                {circle.name}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handlePreview(circle._id!)}
                                                >
                                                    Preview
                                                </Button>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{getCircleKindLabel(circle)}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={getPublishStatusBadgeClassName(circle)}>
                                                {getPublishStatusLabel(circle)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={getCircleLifecycleStatusBadgeClassName(circle)}
                                                data-lifecycle-status={getCircleLifecycleStatus(circle)}
                                            >
                                                {getCircleLifecycleStatusLabel(circle)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{circle.handle}</TableCell>
                                        <TableCell className="max-w-xs truncate">
                                            {circle.description ?? circle.mission}
                                        </TableCell>
                                        <TableCell>{circle.members || 0}</TableCell>
                                        <TableCell>
                                            {circle.createdAt
                                                ? new Date(circle.createdAt).toLocaleDateString()
                                                : "Unknown"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                {getPublishStatus(circle) === "pending_verification" ? (
                                                    <Button variant="outline" size="sm" asChild>
                                                        <Link
                                                            href={`/admin?tab=verification-requests&circleId=${circle._id}`}
                                                        >
                                                            Review
                                                        </Link>
                                                    </Button>
                                                ) : null}
                                                {getCircleLifecycleTransitions(circle).length > 0 ? (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                aria-label={`Lifecycle actions for ${circle.name}`}
                                                            >
                                                                Lifecycle <MoreHorizontal className="ml-1 h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            {getCircleLifecycleTransitions(circle).map((transition) => (
                                                                <DropdownMenuItem
                                                                    key={transition.status}
                                                                    onSelect={() =>
                                                                        openModerationDialog(
                                                                            circle,
                                                                            transition.status,
                                                                            transition.label,
                                                                        )
                                                                    }
                                                                >
                                                                    {transition.label}
                                                                </DropdownMenuItem>
                                                            ))}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                ) : null}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    aria-label={`Permanently delete ${circle.name}`}
                                                    title="Permanently delete"
                                                    onClick={() => handleDeleteClick(circle)}
                                                >
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

            <Dialog
                open={Boolean(moderationCircle && moderationTarget)}
                onOpenChange={(open) => !open && closeModerationDialog()}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{moderationActionLabel} Circle</DialogTitle>
                        <DialogDescription>
                            Change the lifecycle status of &quot;{moderationCircle?.name}&quot; from{" "}
                            {moderationCircle ? getCircleLifecycleStatusLabel(moderationCircle) : ""} to{" "}
                            {moderationTarget
                                ? moderationTarget.charAt(0).toUpperCase() + moderationTarget.slice(1)
                                : ""}
                            .
                            {moderationTarget === "removed"
                                ? " Lifecycle removal does not permanently delete Circle data."
                                : ""}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="circle-moderation-reason">Moderation reason</Label>
                        <Textarea
                            id="circle-moderation-reason"
                            value={moderationReason}
                            onChange={(event) => setModerationReason(event.target.value)}
                            placeholder="Enter the required moderation reason"
                            disabled={moderationSubmitting}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeModerationDialog} disabled={moderationSubmitting}>
                            Cancel
                        </Button>
                        <Button
                            onClick={confirmModerationChange}
                            disabled={!moderationReason.trim() || moderationSubmitting}
                        >
                            {moderationSubmitting ? "Updating..." : `Confirm ${moderationActionLabel}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the circle &quot;{circleToDelete?.name}&quot; and all
                            associated data. This is destructive, cannot be undone, and is different from lifecycle
                            removal, which does not delete Circle data.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-500 hover:bg-red-600">
                            Permanently delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
