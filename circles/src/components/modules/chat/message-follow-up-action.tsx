"use client";

import { useEffect, useRef, useState } from "react";
import { BookmarkCheck, BookmarkPlus, Loader2 } from "lucide-react";
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

type MessageFollowUpActionProps = {
    messageId: string;
    viewerDid: string;
    variant: "icon" | "menu";
    iconSize?: "compact" | "default";
};

const savedFollowUps = new Map<string, string>();
const FOLLOW_UP_STATUS_EVENT = "kamooni:message-follow-up-status";
const FOLLOW_UP_NOTE_EVENT = "kamooni:message-follow-up-note";
const FOLLOW_UP_STATUS_BATCH_MAX = 200;

const requestPrivateNote = (followUpId: string) => {
    window.dispatchEvent(new CustomEvent(FOLLOW_UP_NOTE_EVENT, { detail: { followUpId } }));
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
                    const result = await getMessageFollowUpStatusesAction(
                        ids.slice(offset, offset + FOLLOW_UP_STATUS_BATCH_MAX),
                    );
                    if (cancelled || !result.success || !result.statuses) return;
                    for (const status of result.statuses) {
                        const cacheKey = `${viewerDid}\u0000${status.messageId}`;
                        savedFollowUps.set(cacheKey, status.followUpId);
                        window.dispatchEvent(
                            new CustomEvent(FOLLOW_UP_STATUS_EVENT, {
                                detail: { viewerDid, messageId: status.messageId, followUpId: status.followUpId },
                            }),
                        );
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

export const MessageFollowUpNoteDialog = () => {
    const [followUpId, setFollowUpId] = useState<string | null>(null);
    const [note, setNote] = useState("");
    const [error, setError] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const open = (event: Event) => {
            const id = (event as CustomEvent<{ followUpId?: string }>).detail?.followUpId;
            if (!id) return;
            setFollowUpId(id);
            setNote("");
            setError("");
        };
        window.addEventListener(FOLLOW_UP_NOTE_EVENT, open);
        return () => window.removeEventListener(FOLLOW_UP_NOTE_EVENT, open);
    }, []);

    const save = async () => {
        if (!followUpId || isSaving) return;
        setIsSaving(true);
        setError("");
        try {
            const result = await updateMessageFollowUpNoteAction(followUpId, note);
            if (!result.success) {
                setError(result.message || "Could not save private note.");
                return;
            }
            setFollowUpId(null);
            toast({ title: "Private note saved", description: "Only you can see this note.", variant: "success" });
        } catch (saveError) {
            console.error("Failed to save follow-up note:", saveError);
            setError("Could not save private note. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={!!followUpId} onOpenChange={(open) => !open && setFollowUpId(null)}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Add private note</DialogTitle>
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
                {error && <p className="text-sm text-red-600">{error}</p>}
                <DialogFooter>
                    <Button type="button" variant="outline" disabled={isSaving} onClick={() => setFollowUpId(null)}>
                        Cancel
                    </Button>
                    <Button type="button" disabled={isSaving || !note.trim()} onClick={() => void save()}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save private note
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export const MessageFollowUpAction = ({
    messageId,
    viewerDid,
    variant,
    iconSize = "default",
}: MessageFollowUpActionProps) => {
    const cacheKey = `${viewerDid}\u0000${messageId}`;
    const [followUpId, setFollowUpId] = useState<string | null>(() => savedFollowUps.get(cacheKey) || null);
    const [isSaving, setIsSaving] = useState(false);
    const savingRef = useRef(false);

    useEffect(() => {
        setFollowUpId(savedFollowUps.get(cacheKey) || null);
    }, [cacheKey]);

    useEffect(() => {
        const applyStatus = (event: Event) => {
            const detail = (event as CustomEvent<{ viewerDid?: string; messageId?: string; followUpId?: string }>)
                .detail;
            if (detail?.viewerDid === viewerDid && detail.messageId === messageId && detail.followUpId) {
                setFollowUpId(detail.followUpId);
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
            savedFollowUps.set(cacheKey, savedId);
            setFollowUpId(savedId);
            toast({
                title: "Saved for follow-up",
                description: "Only you can see this follow-up.",
                variant: "success",
                action: (
                    <ToastAction altText="Add private note" onClick={() => requestPrivateNote(savedId)}>
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
