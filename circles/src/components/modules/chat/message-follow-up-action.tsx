"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, BookmarkPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/components/ui/use-toast";
import {
    getMessageFollowUpStatusesAction,
    markMessageForFollowUpAction,
    updateMessageFollowUpNoteAction,
} from "@/components/modules/chat/follow-up-actions";
import { isOpenMessageFollowUpStatus } from "./message-follow-up-ui";
import {
    MessageFollowUpStatusCache,
    isNoteEditorForViewer,
    readCurrentMessageFollowUpStatus,
    type CachedMessageFollowUpStatus,
} from "./message-follow-up-status-cache";

type MessageFollowUpActionProps = {
    messageId: string;
    viewerDid: string;
    variant: "icon" | "menu";
    iconSize?: "compact" | "default";
};

const savedFollowUps = new MessageFollowUpStatusCache();
const FOLLOW_UP_STATUS_EVENT = "kamooni:message-follow-up-status";
const FOLLOW_UP_NOTE_EVENT = "kamooni:message-follow-up-note";
const FOLLOW_UP_STATUS_BATCH_MAX = 200;

const requestPrivateNote = (viewerDid: string, followUpId: string, note?: string) => {
    window.dispatchEvent(new CustomEvent(FOLLOW_UP_NOTE_EVENT, { detail: { viewerDid, followUpId, note } }));
};

const applyMessageFollowUpStatus = (
    viewerDid: string,
    messageId: string,
    status: CachedMessageFollowUpStatus | null,
) => {
    const cacheKey = `${viewerDid}\u0000${messageId}`;
    savedFollowUps.applyMutation(cacheKey, status);
    dispatchMessageFollowUpStatus(viewerDid, messageId, status);
};

const dispatchMessageFollowUpStatus = (
    viewerDid: string,
    messageId: string,
    status: CachedMessageFollowUpStatus | null,
) => {
    window.dispatchEvent(
        new CustomEvent(FOLLOW_UP_STATUS_EVENT, {
            detail: {
                viewerDid,
                messageId,
                followUpId: status?.followUpId,
                completed: status?.completed,
                note: status?.note,
            },
        }),
    );
};

export const updateCachedMessageFollowUpCompletion = (followUpId: string, completed: boolean) => {
    for (const { cacheKey, status } of savedFollowUps.updateFollowUp(followUpId, (value) => ({
        ...value,
        completed,
    }))) {
        const separator = cacheKey.indexOf("\u0000");
        if (separator < 0) continue;
        dispatchMessageFollowUpStatus(cacheKey.slice(0, separator), cacheKey.slice(separator + 1), status);
    }
};

export const updateCachedMessageFollowUpNote = (followUpId: string, note: string) => {
    for (const { cacheKey, status } of savedFollowUps.updateFollowUp(followUpId, (value) => ({
        ...value,
        ...(note.trim() ? { note: note.trim() } : { note: undefined }),
    }))) {
        const separator = cacheKey.indexOf("\u0000");
        if (separator < 0) continue;
        dispatchMessageFollowUpStatus(cacheKey.slice(0, separator), cacheKey.slice(separator + 1), status);
    }
};

export const useHydrateMessageFollowUpStatuses = (viewerDid: string, messageIds: string[]) => {
    const messageIdKey = Array.from(new Set(messageIds)).sort().join(",");
    useEffect(() => {
        if (!viewerDid || !messageIdKey) return;
        let cancelled = false;
        const load = async () => {
            try {
                const ids = messageIdKey.split(",");
                for (let offset = 0; offset < ids.length; offset += FOLLOW_UP_STATUS_BATCH_MAX) {
                    const batch = ids.slice(offset, offset + FOLLOW_UP_STATUS_BATCH_MAX);
                    const tokens = new Map(
                        batch.map((messageId) => [
                            messageId,
                            savedFollowUps.beginHydration(`${viewerDid}\u0000${messageId}`),
                        ]),
                    );
                    const result = await getMessageFollowUpStatusesAction(batch);
                    if (cancelled || !result.success || !result.statuses) return;
                    const statusesByMessageId = new Map(result.statuses.map((status) => [status.messageId, status]));
                    for (const messageId of batch) {
                        const status = statusesByMessageId.get(messageId);
                        const hydratedStatus = status
                            ? { followUpId: status.followUpId, completed: status.completed, note: status.note }
                            : null;
                        if (
                            savedFollowUps.applyHydration(
                                `${viewerDid}\u0000${messageId}`,
                                tokens.get(messageId)!,
                                hydratedStatus,
                            )
                        ) {
                            dispatchMessageFollowUpStatus(viewerDid, messageId, hydratedStatus);
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to load message follow-up statuses:", error);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [messageIdKey, viewerDid]);
};

export const MessageFollowUpNoteDialog = ({ viewerDid }: { viewerDid: string }) => {
    const [editor, setEditor] = useState<{ viewerDid: string; followUpId: string } | null>(null);
    const [note, setNote] = useState("");
    const [error, setError] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const open = (event: Event) => {
            const detail = (event as CustomEvent<{ viewerDid?: string; followUpId?: string; note?: string }>).detail;
            const id = detail?.followUpId;
            if (!id || detail.viewerDid !== viewerDid) return;
            setEditor({ viewerDid, followUpId: id });
            setNote(detail.note || "");
            setError("");
        };
        window.addEventListener(FOLLOW_UP_NOTE_EVENT, open);
        return () => window.removeEventListener(FOLLOW_UP_NOTE_EVENT, open);
    }, [viewerDid]);

    const currentEditor = isNoteEditorForViewer(editor, viewerDid) ? editor : null;

    const save = async () => {
        if (!currentEditor || isSaving) return;
        setIsSaving(true);
        setError("");
        try {
            const result = await updateMessageFollowUpNoteAction(currentEditor.followUpId, note);
            if (!result.success) {
                setError(result.message || "Could not save private note.");
                return;
            }
            updateCachedMessageFollowUpNote(currentEditor.followUpId, note);
            setEditor(null);
            toast({ title: "Private note saved", description: "Only you can see this note.", variant: "success" });
        } catch (saveError) {
            console.error("Failed to save follow-up note:", saveError);
            setError("Could not save private note. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={!!currentEditor} onOpenChange={(open) => !open && setEditor(null)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit private note</DialogTitle>
                    <DialogDescription>This note is private and is never posted to the conversation.</DialogDescription>
                </DialogHeader>
                <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={5}
                    maxLength={4000}
                    placeholder="What do you want to remember?"
                    aria-label="Private follow-up note"
                />
                {error && (
                    <p className="text-sm text-red-600" role="alert">
                        {error}
                    </p>
                )}
                <DialogFooter>
                    <Button type="button" variant="outline" disabled={isSaving} onClick={() => setEditor(null)}>
                        Cancel
                    </Button>
                    <Button type="button" disabled={isSaving} onClick={() => void save()}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save private note
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export const MessageFollowUpIndicator = ({ messageId, viewerDid }: { messageId: string; viewerDid: string }) => {
    const cacheKey = `${viewerDid}\u0000${messageId}`;
    const [cachedState, setCachedState] = useState(() => ({ cacheKey, status: savedFollowUps.get(cacheKey) }));
    const status = readCurrentMessageFollowUpStatus(savedFollowUps, cachedState, cacheKey);

    useEffect(() => {
        const applyStatus = (event: Event) => {
            const detail = (
                event as CustomEvent<{
                    viewerDid?: string;
                    messageId?: string;
                    followUpId?: string;
                    completed?: boolean;
                    note?: string;
                }>
            ).detail;
            if (detail?.viewerDid !== viewerDid || detail.messageId !== messageId) return;
            setCachedState({
                cacheKey,
                status: detail.followUpId
                    ? { followUpId: detail.followUpId, completed: detail.completed === true, note: detail.note }
                    : null,
            });
        };
        window.addEventListener(FOLLOW_UP_STATUS_EVENT, applyStatus);
        return () => window.removeEventListener(FOLLOW_UP_STATUS_EVENT, applyStatus);
    }, [messageId, viewerDid]);

    if (!isOpenMessageFollowUpStatus(status)) return null;

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative h-7 w-7 flex-none rounded-full text-[#315C3D] after:absolute after:-inset-2 after:content-[''] hover:bg-[#F1F6DF] hover:text-[#315C3D]"
            onClick={(event) => {
                event.stopPropagation();
                requestPrivateNote(viewerDid, status!.followUpId, status!.note);
            }}
            aria-label="Edit private follow-up note"
            title="Saved for follow-up"
        >
            <Bookmark className="h-4 w-4 fill-current" aria-hidden="true" />
        </Button>
    );
};

export const MessageFollowUpAction = ({
    messageId,
    viewerDid,
    variant,
    iconSize = "default",
}: MessageFollowUpActionProps) => {
    const cacheKey = `${viewerDid}\u0000${messageId}`;
    const [cachedState, setCachedState] = useState(() => ({ cacheKey, status: savedFollowUps.get(cacheKey) }));
    const status = readCurrentMessageFollowUpStatus(savedFollowUps, cachedState, cacheKey);
    const followUpId = status?.followUpId || null;
    const [isSaving, setIsSaving] = useState(false);
    const savingRef = useRef(false);

    useEffect(() => {
        const applyStatus = (event: Event) => {
            const detail = (
                event as CustomEvent<{
                    viewerDid?: string;
                    messageId?: string;
                    followUpId?: string;
                    completed?: boolean;
                    note?: string;
                }>
            ).detail;
            if (detail?.viewerDid === viewerDid && detail.messageId === messageId) {
                setCachedState({
                    cacheKey,
                    status: detail.followUpId
                        ? { followUpId: detail.followUpId, completed: detail.completed === true, note: detail.note }
                        : null,
                });
            }
        };
        window.addEventListener(FOLLOW_UP_STATUS_EVENT, applyStatus);
        return () => window.removeEventListener(FOLLOW_UP_STATUS_EVENT, applyStatus);
    }, [messageId, viewerDid]);

    const markForFollowUp = async () => {
        if (savingRef.current || followUpId) return;
        savingRef.current = true;
        setIsSaving(true);
        try {
            const result = await markMessageForFollowUpAction(messageId);
            if (!result.success || !result.followUp?._id) {
                toast({
                    title: "Could not save follow-up",
                    description: result.message || "This message may no longer be available.",
                    variant: "destructive",
                });
                return;
            }
            const savedId = result.followUp._id;
            applyMessageFollowUpStatus(viewerDid, messageId, { followUpId: savedId, completed: false });
            toast({
                title: "Saved for follow-up",
                description: "Only you can see this follow-up.",
                variant: "success",
                action: (
                    <ToastAction altText="Add private note" onClick={() => requestPrivateNote(viewerDid, savedId)}>
                        Add private note
                    </ToastAction>
                ),
            });
        } catch (error) {
            console.error("Failed to save message follow-up:", error);
            toast({
                title: "Could not save follow-up",
                description: "Please try again.",
                variant: "destructive",
            });
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    };

    const label = followUpId ? "Saved for follow-up" : "Follow up";
    const icon = isSaving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
    ) : followUpId ? (
        <BookmarkCheck className="h-4 w-4" />
    ) : (
        <BookmarkPlus className="h-4 w-4" />
    );

    return (
        <>
            {variant === "menu" ? (
                <DropdownMenuItem disabled={isSaving || !!followUpId} onSelect={() => void markForFollowUp()}>
                    <span className="mr-2">{icon}</span>
                    {label}
                </DropdownMenuItem>
            ) : (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={iconSize === "compact" ? "h-6 w-6" : "h-8 w-8"}
                    disabled={isSaving || !!followUpId}
                    onClick={() => void markForFollowUp()}
                    aria-label={label}
                    title={label}
                >
                    {icon}
                </Button>
            )}
        </>
    );
};
