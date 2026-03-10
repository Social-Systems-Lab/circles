"use client";

import { useState } from "react";
import {
    createPlatformBroadcastMessageAction,
    deletePlatformBroadcastMessageAction,
    getPlatformBroadcastMessagesAction,
    previewPlatformBroadcastMessageToSelfAction,
    updatePlatformBroadcastMessageAction,
} from "../actions";
import type { PlatformBroadcastMessageDisplay } from "@/lib/data/platform-broadcasts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

type SystemMessagesTabProps = {
    initialBroadcasts: PlatformBroadcastMessageDisplay[];
};

export default function SystemMessagesTab({ initialBroadcasts }: SystemMessagesTabProps) {
    const [broadcasts, setBroadcasts] = useState<PlatformBroadcastMessageDisplay[]>(initialBroadcasts);
    const [newBody, setNewBody] = useState("");
    const [newActive, setNewActive] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isSavingById, setIsSavingById] = useState<Record<string, boolean>>({});
    const [draftBodyById, setDraftBodyById] = useState<Record<string, string>>(
        Object.fromEntries(initialBroadcasts.map((broadcast) => [broadcast.id, broadcast.body])),
    );
    const [draftActiveById, setDraftActiveById] = useState<Record<string, boolean>>(
        Object.fromEntries(initialBroadcasts.map((broadcast) => [broadcast.id, broadcast.active])),
    );

    const refreshBroadcasts = async () => {
        setIsRefreshing(true);
        try {
            const data = await getPlatformBroadcastMessagesAction();
            setBroadcasts(data);
            setDraftBodyById(Object.fromEntries(data.map((broadcast) => [broadcast.id, broadcast.body])));
            setDraftActiveById(Object.fromEntries(data.map((broadcast) => [broadcast.id, broadcast.active])));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to refresh system messages.");
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleCreate = async () => {
        const trimmed = newBody.trim();
        if (!trimmed) {
            toast.error("Message body is required.");
            return;
        }

        setIsCreating(true);
        try {
            const result = await createPlatformBroadcastMessageAction(trimmed, newActive);
            if (!result.success) {
                toast.error(result.message || "Failed to create broadcast message.");
                return;
            }

            if (result.broadcast) {
                const nextBroadcasts = [result.broadcast, ...broadcasts];
                setBroadcasts(nextBroadcasts);
                setDraftBodyById((prev) => ({ ...prev, [result.broadcast!.id]: result.broadcast!.body }));
                setDraftActiveById((prev) => ({ ...prev, [result.broadcast!.id]: result.broadcast!.active }));
            }
            setNewBody("");
            setNewActive(true);
            toast.success("Platform broadcast message created.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create platform broadcast message.");
        } finally {
            setIsCreating(false);
        }
    };

    const handlePreviewToSelf = async () => {
        const trimmed = newBody.trim();
        if (!trimmed) {
            toast.error("Message body is required.");
            return;
        }

        setIsPreviewing(true);
        try {
            const result = await previewPlatformBroadcastMessageToSelfAction(trimmed);
            if (!result.success) {
                toast.error(result.message || "Failed to preview broadcast message.");
                return;
            }

            toast.success("Preview sent to your Platform Announcements chat.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to preview platform broadcast message.");
        } finally {
            setIsPreviewing(false);
        }
    };

    const handleSave = async (id: string) => {
        const body = (draftBodyById[id] || "").trim();
        if (!body) {
            toast.error("Message body is required.");
            return;
        }

        setIsSavingById((prev) => ({ ...prev, [id]: true }));
        try {
            const result = await updatePlatformBroadcastMessageAction(id, body, draftActiveById[id] === true);
            if (!result.success || !result.broadcast) {
                toast.error(result.message || "Failed to update broadcast message.");
                return;
            }

            setBroadcasts((prev) =>
                prev.map((broadcast) => (broadcast.id === id ? result.broadcast! : broadcast)),
            );
            setDraftBodyById((prev) => ({ ...prev, [id]: result.broadcast.body }));
            setDraftActiveById((prev) => ({ ...prev, [id]: result.broadcast.active }));
            toast.success("Platform broadcast message updated.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update platform broadcast message.");
        } finally {
            setIsSavingById((prev) => ({ ...prev, [id]: false }));
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Delete this platform broadcast message?")) {
            return;
        }

        setIsSavingById((prev) => ({ ...prev, [id]: true }));
        try {
            const result = await deletePlatformBroadcastMessageAction(id);
            if (!result.success) {
                toast.error(result.message || "Failed to delete broadcast message.");
                return;
            }

            setBroadcasts((prev) => prev.filter((broadcast) => broadcast.id !== id));
            setDraftBodyById((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
            setDraftActiveById((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
            toast.success("Platform broadcast message deleted.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete platform broadcast message.");
        } finally {
            setIsSavingById((prev) => ({ ...prev, [id]: false }));
        }
    };

    return (
        <div className="space-y-6">
            <div className="rounded-md border p-4">
                <h3 className="mb-3 text-lg font-semibold">New Platform Broadcast</h3>
                <Textarea
                    placeholder="Write an announcement for all users..."
                    value={newBody}
                    onChange={(e) => setNewBody(e.target.value)}
                    rows={4}
                />
                <div className="mt-3 flex items-center gap-2">
                    <Switch id="new-broadcast-active" checked={newActive} onCheckedChange={setNewActive} />
                    <Label htmlFor="new-broadcast-active">Active</Label>
                </div>
                <div className="mt-4 flex items-center gap-2">
                    <Button onClick={handleCreate} disabled={isCreating}>
                        {isCreating ? "Creating..." : "Create Broadcast"}
                    </Button>
                    <Button variant="outline" onClick={handlePreviewToSelf} disabled={isPreviewing}>
                        {isPreviewing ? "Sending Preview..." : "Preview to Self"}
                    </Button>
                    <Button variant="outline" onClick={refreshBroadcasts} disabled={isRefreshing}>
                        {isRefreshing ? (
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Refresh
                    </Button>
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="text-lg font-semibold">Existing Platform Broadcasts</h3>
                {broadcasts.length === 0 ? (
                    <div className="rounded-md border p-4 text-sm text-muted-foreground">No platform broadcasts yet.</div>
                ) : (
                    broadcasts.map((broadcast) => {
                        const isSaving = !!isSavingById[broadcast.id];
                        return (
                            <div key={broadcast.id} className="rounded-md border p-4">
                                <div className="mb-2 text-xs text-muted-foreground">
                                    Created {new Date(broadcast.createdAt).toLocaleString()} · Updated{" "}
                                    {new Date(broadcast.updatedAt).toLocaleString()}
                                </div>
                                <Textarea
                                    value={draftBodyById[broadcast.id] ?? broadcast.body}
                                    onChange={(e) =>
                                        setDraftBodyById((prev) => ({ ...prev, [broadcast.id]: e.target.value }))
                                    }
                                    rows={4}
                                />
                                <div className="mt-3 flex items-center gap-2">
                                    <Switch
                                        id={`broadcast-active-${broadcast.id}`}
                                        checked={draftActiveById[broadcast.id] ?? broadcast.active}
                                        onCheckedChange={(checked) =>
                                            setDraftActiveById((prev) => ({ ...prev, [broadcast.id]: checked }))
                                        }
                                    />
                                    <Label htmlFor={`broadcast-active-${broadcast.id}`}>Active</Label>
                                </div>
                                <div className="mt-4 flex items-center gap-2">
                                    <Button onClick={() => handleSave(broadcast.id)} disabled={isSaving}>
                                        {isSaving ? "Saving..." : "Save"}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => handleDelete(broadcast.id)}
                                        disabled={isSaving}
                                    >
                                        <Trash2 className="mr-2 h-4 w-4 text-red-500" />
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
