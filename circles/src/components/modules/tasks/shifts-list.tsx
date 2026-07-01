"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronDown, Loader2, MoreHorizontal, Plus } from "lucide-react";
import { useAtom } from "jotai";
import { Circle, TaskDisplay, TaskPermissions } from "@/models/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/components/ui/use-toast";
import { userAtom } from "@/lib/data/atoms";
import { isAuthorized } from "@/lib/auth/client-auth";
import { features } from "@/lib/data/constants";
import { cn } from "@/lib/utils";
import { UserPicture } from "../members/user-picture";
import { CreateShiftDialog } from "@/components/global-create/create-shift-dialog";
import { deleteTaskAction } from "@/app/circles/[handle]/tasks/actions";
import {
    getShiftConfirmedSummary,
    getShiftDisplayStatus,
    getShiftPendingSummary,
    getShiftStartAt,
    isShiftTask,
} from "./shift-task-utils";
import { getShiftStageInfo, taskTitleLinkClassName } from "./task-ui";

interface ShiftsListProps {
    tasksData: {
        tasks: TaskDisplay[];
        hasUserRanked: boolean;
        totalRankers: number;
        unrankedCount: number;
        userRankBecameStaleAt: Date | null;
    };
    circle: Circle;
    permissions: TaskPermissions;
}

const formatShiftDate = (task: TaskDisplay) => {
    const startAt = getShiftStartAt(task);
    const date = startAt ?? (task.targetDate ? new Date(task.targetDate) : null);

    if (!date || Number.isNaN(date.getTime())) {
        return "No date";
    }

    return date.toLocaleDateString();
};

const formatShiftTime = (task: TaskDisplay) => {
    const startAt = getShiftStartAt(task);

    if (!startAt) {
        return task.shiftStartTime || "No time";
    }

    return startAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatShiftDuration = (durationMinutes?: number) => {
    if (!durationMinutes) {
        return "No duration";
    }

    if (durationMinutes < 60) {
        return `${durationMinutes} min`;
    }

    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
};

const getShiftSortTime = (task: TaskDisplay) => {
    const startAt = getShiftStartAt(task);
    if (startAt) {
        return startAt.getTime();
    }

    if (task.targetDate) {
        return new Date(task.targetDate).getTime();
    }

    return Number.POSITIVE_INFINITY;
};

const ShiftsList: React.FC<ShiftsListProps> = ({ tasksData, circle, permissions }) => {
    const [user] = useAtom(userAtom);
    const router = useRouter();
    const { toast } = useToast();
    const [searchText, setSearchText] = useState("");
    const [isCreateShiftDialogOpen, setIsCreateShiftDialogOpen] = useState(false);
    const [isCompletedSectionOpen, setIsCompletedSectionOpen] = useState(false);
    const [deleteShiftDialogOpen, setDeleteShiftDialogOpen] = useState(false);
    const [selectedShift, setSelectedShift] = useState<TaskDisplay | null>(null);
    const [isPending, startTransition] = useTransition();

    const shifts = useMemo(
        () =>
            tasksData.tasks
                .filter(isShiftTask)
                .filter((shift) => shift.title.toLocaleLowerCase().includes(searchText.trim().toLocaleLowerCase()))
                .sort((left, right) => getShiftSortTime(left) - getShiftSortTime(right)),
        [searchText, tasksData.tasks],
    );

    const activeShifts = shifts.filter((shift) => getShiftDisplayStatus(shift) !== "completed");
    const completedShifts = shifts.filter((shift) => getShiftDisplayStatus(shift) === "completed");
    const showCircleColumn = circle.circleType === "user" && user?.did === circle.did;
    const canCreateShift = isAuthorized(user, circle, features.tasks.create);

    const handleCreateShiftSuccess = (data: { id?: string; circleHandle?: string }) => {
        toast({
            title: "Shift Created",
            description: "The new shift has been successfully created.",
        });
        setIsCreateShiftDialogOpen(false);
        router.refresh();

        if (data.id && data.circleHandle) {
            router.push(`/circles/${data.circleHandle}/shifts/${data.id}`);
        } else if (data.id) {
            router.push(`/circles/${circle.handle}/shifts/${data.id}`);
        }
    };

    const onConfirmDeleteShift = async () => {
        if (!selectedShift) {
            return;
        }

        startTransition(async () => {
            const result = await deleteTaskAction(circle.handle!, selectedShift._id as string);

            if (result.success) {
                toast({ title: "Success", description: result.message });
                router.refresh();
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to delete shift",
                    variant: "destructive",
                });
            }

            setDeleteShiftDialogOpen(false);
            setSelectedShift(null);
        });
    };

    const renderShiftRow = (shift: TaskDisplay) => {
        const shiftCircleHandle = shift.circle?.handle || circle.handle;
        const shiftCircle = shift.circle || circle;
        const status = getShiftDisplayStatus(shift);
        const stageInfo = getShiftStageInfo(status);
        const StageIcon = stageInfo.icon;
        const pendingSummary = permissions.canModerate ? getShiftPendingSummary(shift) : null;
        const isAuthor = user?.did === shift.createdBy;
        const canEdit = (isAuthor && shift.stage === "review") || permissions.canModerate;
        const canDelete = isAuthor || permissions.canModerate;

        return (
            <TableRow key={shift._id as string} className="bg-white hover:bg-sky-50/60">
                <TableCell>
                    <div className="flex min-w-0 flex-col gap-1">
                        <Link
                            href={`/circles/${shiftCircleHandle}/shifts/${shift._id}#circle-tabs`}
                            className={cn("truncate", taskTitleLinkClassName)}
                        >
                            {shift.title}
                        </Link>
                        {shift.description ? (
                            <span className="line-clamp-1 text-xs text-muted-foreground">{shift.description}</span>
                        ) : null}
                    </div>
                </TableCell>
                {showCircleColumn && (
                    <TableCell>
                        <span>{shiftCircle.name || shiftCircle.handle || "Unknown"}</span>
                    </TableCell>
                )}
                <TableCell>
                    <span className={shift.targetDate ? "" : "text-muted-foreground"}>{formatShiftDate(shift)}</span>
                </TableCell>
                <TableCell>
                    <span className={shift.shiftStartTime ? "" : "text-muted-foreground"}>
                        {formatShiftTime(shift)}
                    </span>
                </TableCell>
                <TableCell>
                    <span className={shift.shiftDurationMinutes ? "" : "text-muted-foreground"}>
                        {formatShiftDuration(shift.shiftDurationMinutes)}
                    </span>
                </TableCell>
                <TableCell>
                    <div className="flex flex-col gap-1 text-sm">
                        <span className="font-medium">{getShiftConfirmedSummary(shift)}</span>
                        {pendingSummary && <span className="text-xs text-amber-700">{pendingSummary}</span>}
                    </div>
                </TableCell>
                <TableCell>
                    <Badge className={`${stageInfo.color} w-fit items-center gap-1`}>
                        <StageIcon className="h-3 w-3" />
                        {stageInfo.text}
                    </Badge>
                </TableCell>
                <TableCell>
                    <div className="flex items-center gap-2">
                        <UserPicture name={shift.author.name} picture={shift.author.picture?.url} size="28px" />
                        <span className="hidden text-sm md:inline">{shift.author.name}</span>
                    </div>
                </TableCell>
                <TableCell className="w-[40px]">
                    {(canEdit || canDelete) && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {canEdit && (
                                    <DropdownMenuItem
                                        onClick={() =>
                                            router.push(`/circles/${shiftCircleHandle}/shifts/${shift._id}/edit`)
                                        }
                                        disabled={shift.stage === "resolved"}
                                    >
                                        Edit
                                    </DropdownMenuItem>
                                )}
                                {canDelete && (
                                    <DropdownMenuItem
                                        className="text-red-600"
                                        onClick={() => {
                                            setSelectedShift(shift);
                                            setDeleteShiftDialogOpen(true);
                                        }}
                                    >
                                        Delete
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </TableCell>
            </TableRow>
        );
    };

    const renderShiftTable = (rows: TaskDisplay[], emptyMessage: string) => (
        <div className="overflow-hidden rounded-[15px] shadow-lg">
            <Table className="overflow-hidden">
                <TableHeader className="bg-white">
                    <TableRow className="!border-b-0">
                        <TableHead>Shift</TableHead>
                        {showCircleColumn && <TableHead>Circle / Project</TableHead>}
                        <TableHead>Date</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Slots / participants</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created By</TableHead>
                        <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody className="bg-white">
                    {rows.length ? (
                        rows.map(renderShiftRow)
                    ) : (
                        <TableRow>
                            <TableCell colSpan={showCircleColumn ? 9 : 8} className="h-24 text-center">
                                {emptyMessage}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );

    return (
        <div className="flex flex-1 flex-row justify-center">
            <div className="mb-4 ml-2 mr-2 mt-4 flex max-w-[1100px] flex-1 flex-col">
                <div className="flex w-full flex-wrap items-center gap-2">
                    <div className="flex min-w-[220px] flex-1 flex-col">
                        <Input
                            placeholder="Search shifts by title..."
                            value={searchText}
                            onChange={(event) => setSearchText(event.target.value)}
                        />
                    </div>
                    {canCreateShift && (
                        <Button onClick={() => setIsCreateShiftDialogOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" /> Create Shift
                        </Button>
                    )}
                </div>

                <div className="mt-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <CalendarClock className="h-4 w-4" />
                        Upcoming shifts
                    </div>
                    {renderShiftTable(activeShifts, "No upcoming shifts found.")}
                </div>

                {completedShifts.length > 0 && (
                    <Collapsible
                        open={isCompletedSectionOpen}
                        onOpenChange={setIsCompletedSectionOpen}
                        className="mt-6 overflow-hidden rounded-[15px] border border-gray-200 bg-white shadow-lg"
                    >
                        <CollapsibleTrigger asChild>
                            <Button
                                variant="ghost"
                                className="flex w-full items-center justify-between rounded-none px-4 py-6 text-left text-base font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                            >
                                <span>Review completed shifts ({completedShifts.length})</span>
                                <ChevronDown
                                    className={`h-4 w-4 transition-transform ${
                                        isCompletedSectionOpen ? "rotate-180" : ""
                                    }`}
                                />
                            </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="border-t border-gray-200 p-4 pt-0">
                            <div className="pt-4">
                                {renderShiftTable(completedShifts, "No completed shifts found.")}
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                )}

                <Dialog open={deleteShiftDialogOpen} onOpenChange={setDeleteShiftDialogOpen}>
                    <DialogContent
                        onInteractOutside={(event) => {
                            event.preventDefault();
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>Delete Shift</DialogTitle>
                            <DialogDescription>
                                Are you sure you want to delete the shift &quot;{selectedShift?.title}&quot;? This
                                action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button variant="destructive" onClick={onConfirmDeleteShift} disabled={isPending}>
                                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Delete
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {canCreateShift && (
                    <CreateShiftDialog
                        isOpen={isCreateShiftDialogOpen}
                        onOpenChange={setIsCreateShiftDialogOpen}
                        onSuccess={handleCreateShiftSuccess}
                        initialSelectedCircleId={circle._id as string}
                    />
                )}
            </div>
        </div>
    );
};

export default ShiftsList;
