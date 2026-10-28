"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ExternalLink, FileText, Loader2, MessageCircle, Pencil, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import {
    listMessageFollowUpsAction,
    setMessageFollowUpCompletedAction,
    updateMessageFollowUpNoteAction,
} from "@/components/modules/chat/follow-up-actions";
import {
    updateCachedMessageFollowUpCompletion,
    updateCachedMessageFollowUpNote,
} from "@/components/modules/chat/message-follow-up-action";
import type { ChatFollowUpCursor, ChatFollowUpListItem } from "@/lib/data/chat-message-followups";
import {
    moveFollowUpBetweenFilters,
    reconcileFollowUpListResponse,
    type FollowUpFilterName,
    type FollowUpMutation,
    updateFollowUpNoteInItems,
} from "./message-follow-up-list-state";

type FilterName = FollowUpFilterName;
type FilterState = {
    items: ChatFollowUpListItem[];
    nextCursor?: ChatFollowUpCursor;
    loaded: boolean;
    loading: boolean;
    error?: string;
};

const emptyFilterState = (): FilterState => ({ items: [], loaded: false, loading: false });

const formatMessageDate = (value: Date) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "Date unavailable"
        : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
};

const senderInitials = (name?: string) =>
    (name || "Message")
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");

export function MessageFollowUpList() {
    const router = useRouter();
    const [activeFilter, setActiveFilter] = useState<FilterName>("open");
    const [filters, setFilters] = useState<Record<FilterName, FilterState>>({
        open: emptyFilterState(),
        completed: emptyFilterState(),
    });
    const [editing, setEditing] = useState<ChatFollowUpListItem | null>(null);
    const [note, setNote] = useState("");
    const [noteError, setNoteError] = useState("");
    const [savingNote, setSavingNote] = useState(false);
    const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
    const [announcement, setAnnouncement] = useState("");
    const inFlightRef = useRef<Record<FilterName, boolean>>({ open: false, completed: false });
    const requestGenerationRef = useRef<Record<FilterName, number>>({ open: 0, completed: 0 });
    const mutationVersionRef = useRef(0);
    const mutationsRef = useRef<Map<string, FollowUpMutation>>(new Map());

    const recordMutation = (followUpId: string, destination?: FilterName) => {
        mutationVersionRef.current += 1;
        mutationsRef.current.set(followUpId, { version: mutationVersionRef.current, destination });
    };

    const loadFilter = async (filter: FilterName, loadMore = false) => {
        const current = filters[filter];
        if (inFlightRef.current[filter] || (loadMore && !current.nextCursor)) return;
        inFlightRef.current[filter] = true;
        const generation = ++requestGenerationRef.current[filter];
        const requestMutationVersion = mutationVersionRef.current;
        setFilters((value) => ({
            ...value,
            [filter]: { ...value[filter], loading: true, error: undefined },
        }));
        try {
            const result = await listMessageFollowUpsAction({
                completed: filter === "completed",
                limit: 25,
                ...(loadMore && current.nextCursor ? { cursor: current.nextCursor } : {}),
            });
            if (!result.success || !("items" in result)) {
                throw new Error(result.message || "Could not load follow-ups.");
            }
            if (generation !== requestGenerationRef.current[filter]) return;
            setFilters((value) => ({
                ...value,
                [filter]: {
                    items: reconcileFollowUpListResponse({
                        current: value[filter].items,
                        incoming: result.items,
                        filter,
                        requestMutationVersion,
                        mutations: mutationsRef.current,
                        loadMore,
                    }),
                    nextCursor: result.nextCursor,
                    loaded: true,
                    loading: false,
                },
            }));
        } catch (error) {
            if (generation !== requestGenerationRef.current[filter]) return;
            setFilters((value) => ({
                ...value,
                [filter]: {
                    ...value[filter],
                    loaded: true,
                    loading: false,
                    error: error instanceof Error ? error.message : "Could not load follow-ups.",
                },
            }));
        } finally {
            if (generation === requestGenerationRef.current[filter]) inFlightRef.current[filter] = false;
        }
    };

    useEffect(() => {
        if (!filters[activeFilter].loaded && !filters[activeFilter].loading) void loadFilter(activeFilter);
        // Each filter is intentionally fetched only on first selection.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeFilter, filters.completed.loaded, filters.open.loaded]);

    const openEditor = (item: ChatFollowUpListItem) => {
        setEditing(item);
        setNote(item.followUp.note || "");
        setNoteError("");
    };

    const saveNote = async () => {
        if (!editing || savingNote) return;
        setSavingNote(true);
        setNoteError("");
        try {
            const result = await updateMessageFollowUpNoteAction(editing.followUp.id, note);
            if (!result.success) {
                setNoteError(result.message || "Could not save private note.");
                return;
            }
            updateCachedMessageFollowUpNote(editing.followUp.id, note);
            recordMutation(editing.followUp.id);
            setFilters((value) => ({
                open: { ...value.open, items: updateFollowUpNoteInItems(value.open.items, editing.followUp.id, note) },
                completed: {
                    ...value.completed,
                    items: updateFollowUpNoteInItems(value.completed.items, editing.followUp.id, note),
                },
            }));
            setEditing(null);
            setAnnouncement("Private note saved.");
            toast({ title: "Private note saved", description: "Only you can see this note.", variant: "success" });
        } catch (error) {
            console.error("Failed to save private follow-up note:", error);
            setNoteError("Could not save private note. Please try again.");
        } finally {
            setSavingNote(false);
        }
    };

    const setCompleted = async (item: ChatFollowUpListItem, completed: boolean) => {
        const id = item.followUp.id;
        if (pendingIds.has(id)) return;
        setPendingIds((current) => new Set(current).add(id));
        try {
            const result = await setMessageFollowUpCompletedAction(id, completed);
            if (!result.success) throw new Error(result.message || "Could not update follow-up.");
            updateCachedMessageFollowUpCompletion(id, completed);
            recordMutation(id, completed ? "completed" : "open");
            setFilters((value) => {
                const sourceName: FilterName = completed ? "open" : "completed";
                const destinationName: FilterName = completed ? "completed" : "open";
                const moved = moveFollowUpBetweenFilters(
                    value[sourceName].items,
                    value[destinationName].items,
                    id,
                    completed,
                );
                return {
                    ...value,
                    [sourceName]: { ...value[sourceName], items: moved.source },
                    [destinationName]: { ...value[destinationName], items: moved.destination },
                };
            });
            setAnnouncement(completed ? "Follow-up completed." : "Follow-up reopened.");
            toast({ title: completed ? "Follow-up completed" : "Follow-up reopened", variant: "success" });
        } catch (error) {
            toast({
                title: "Could not update follow-up",
                description: error instanceof Error ? error.message : "Please try again.",
                variant: "destructive",
            });
        } finally {
            setPendingIds((current) => {
                const next = new Set(current);
                next.delete(id);
                return next;
            });
        }
    };

    const active = filters[activeFilter];

    return (
        <div className="min-h-screen bg-gray-50 px-3 pb-24 pt-16 sm:px-5 md:px-8 md:pb-10 md:pt-8">
            <div className="mx-auto max-w-3xl">
                <header className="mb-5">
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 md:hidden"
                            onClick={() => router.push("/chat")}
                            aria-label="Back to messages"
                        >
                            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-semibold text-gray-900">My follow-ups</h1>
                            <p className="mt-1 text-sm text-gray-600">
                                Saved messages and private notes are visible only to you.
                            </p>
                        </div>
                    </div>
                </header>

                <p className="sr-only" aria-live="polite" aria-atomic="true">
                    {announcement}
                </p>
                <Tabs value={activeFilter} onValueChange={(value) => setActiveFilter(value as FilterName)}>
                    <TabsList className="mb-5 grid h-auto w-full grid-cols-2" aria-label="Follow-up status">
                        {(["open", "completed"] as const).map((filter) => (
                            <TabsTrigger
                                key={filter}
                                value={filter}
                                className="h-11 capitalize data-[state=active]:text-[#2d6a45]"
                            >
                                {filter}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    <TabsContent value={activeFilter} className="mt-0">
                        {!active.loaded && active.loading ? (
                            <div className="space-y-3" role="status" aria-label="Loading follow-ups">
                                {[0, 1, 2].map((key) => (
                                    <Skeleton key={key} className="h-52 w-full rounded-xl" />
                                ))}
                            </div>
                        ) : active.error && active.items.length === 0 ? (
                            <Card>
                                <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                                    <p className="text-sm text-red-700" role="alert">
                                        {active.error}
                                    </p>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-11"
                                        onClick={() => void loadFilter(activeFilter)}
                                    >
                                        Retry
                                    </Button>
                                </CardContent>
                            </Card>
                        ) : active.items.length === 0 ? (
                            <Card>
                                <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                                    <MessageCircle className="h-10 w-10 text-gray-400" aria-hidden="true" />
                                    <p className="font-medium text-gray-900">
                                        {activeFilter === "open" ? "No open follow-ups" : "No completed follow-ups"}
                                    </p>
                                    <p className="max-w-sm text-sm text-gray-600">
                                        {active.nextCursor
                                            ? "Some saved items are no longer accessible. Continue to look for more."
                                            : activeFilter === "open"
                                              ? "Save a message from a conversation when you want to return to it."
                                              : "Completed follow-ups will appear here."}
                                    </p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="space-y-3">
                                {active.items.map((item) => {
                                    const message = item.message;
                                    const pending = pendingIds.has(item.followUp.id);
                                    return (
                                        <Card key={item.followUp.id} className="overflow-hidden">
                                            <CardContent className="p-4 sm:p-5">
                                                {message ? (
                                                    <>
                                                        <div className="flex min-w-0 items-start gap-3">
                                                            <Avatar className="h-10 w-10 flex-none">
                                                                <AvatarImage
                                                                    src={message.sender.avatarUrl || ""}
                                                                    alt=""
                                                                />
                                                                <AvatarFallback>
                                                                    {senderInitials(message.sender.name)}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate font-medium text-gray-900">
                                                                    {message.sender.name ||
                                                                        message.sender.handle ||
                                                                        "Message sender"}
                                                                </p>
                                                                <p className="truncate text-sm text-gray-600">
                                                                    {message.conversation.name}
                                                                    {message.topic?.title
                                                                        ? ` · ${message.topic.title}`
                                                                        : ""}
                                                                </p>
                                                                <p className="mt-0.5 text-xs text-gray-500">
                                                                    {formatMessageDate(message.createdAt)}
                                                                    {message.editedAt ? " · Edited" : ""}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <p className="mt-4 line-clamp-3 whitespace-pre-wrap break-words text-sm text-gray-800">
                                                            {message.body || "Message with attachments"}
                                                        </p>
                                                        {message.attachments.length > 0 && (
                                                            <ul className="mt-3 space-y-1" aria-label="Attachments">
                                                                {message.attachments.map((attachment, index) => (
                                                                    <li
                                                                        key={`${attachment.name}-${index}`}
                                                                        className="flex min-w-0 items-center gap-2 text-sm text-gray-600"
                                                                    >
                                                                        <FileText
                                                                            className="h-4 w-4 flex-none"
                                                                            aria-hidden="true"
                                                                        />
                                                                        <span className="truncate">
                                                                            {attachment.name}
                                                                        </span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </>
                                                ) : (
                                                    <div role="status">
                                                        <p className="font-medium text-gray-900">
                                                            This saved message is no longer available
                                                        </p>
                                                        <p className="mt-1 text-sm text-gray-600">
                                                            Its original content and conversation details cannot be
                                                            shown.
                                                        </p>
                                                    </div>
                                                )}

                                                <div className="mt-4 rounded-lg bg-[#F7F9EF] p-3">
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-[#466238]">
                                                        Private note
                                                    </p>
                                                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">
                                                        {item.followUp.note || "No private note yet."}
                                                    </p>
                                                </div>

                                                <div className="mt-4 flex flex-col gap-2 min-[360px]:flex-row min-[360px]:flex-wrap">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="h-11 min-w-0 gap-2"
                                                        onClick={() => openEditor(item)}
                                                    >
                                                        <Pencil className="h-4 w-4" aria-hidden="true" />
                                                        Edit note
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="h-11 min-w-0 gap-2"
                                                        disabled={pending}
                                                        onClick={() => void setCompleted(item, activeFilter === "open")}
                                                    >
                                                        {pending ? (
                                                            <Loader2
                                                                className="h-4 w-4 animate-spin"
                                                                aria-hidden="true"
                                                            />
                                                        ) : activeFilter === "open" ? (
                                                            <Check className="h-4 w-4" aria-hidden="true" />
                                                        ) : (
                                                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                                        )}
                                                        {activeFilter === "open" ? "Mark complete" : "Reopen"}
                                                    </Button>
                                                    {message && (
                                                        <Button
                                                            type="button"
                                                            className="h-11 min-w-0 gap-2 min-[360px]:ml-auto"
                                                            onClick={() =>
                                                                router.push(
                                                                    `/chat/${message.conversationId}${
                                                                        message.topicId
                                                                            ? `?topic=${message.topicId}`
                                                                            : ""
                                                                    }`,
                                                                )
                                                            }
                                                        >
                                                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                                            {message.topicId ? "Open topic" : "Open conversation"}
                                                        </Button>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}

                        {active.nextCursor && (
                            <div className="mt-5 text-center">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-11"
                                    disabled={active.loading}
                                    onClick={() => void loadFilter(activeFilter, true)}
                                >
                                    {active.loading && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                                    )}
                                    Load more
                                </Button>
                                {active.error && (
                                    <p className="mt-2 text-sm text-red-700" role="alert">
                                        {active.error}
                                    </p>
                                )}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            <Dialog open={!!editing} onOpenChange={(open) => !open && !savingNote && setEditing(null)}>
                <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit private note</DialogTitle>
                        <DialogDescription>
                            This note is private and is never posted to the conversation.
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        rows={6}
                        maxLength={4000}
                        placeholder="What do you want to remember?"
                        aria-label="Private follow-up note"
                        autoFocus
                    />
                    {noteError && (
                        <p className="text-sm text-red-700" role="alert">
                            {noteError}
                        </p>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            className="h-11"
                            disabled={savingNote}
                            onClick={() => setEditing(null)}
                        >
                            Cancel
                        </Button>
                        <Button type="button" className="h-11" disabled={savingNote} onClick={() => void saveNote()}>
                            {savingNote && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                            Save note
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
