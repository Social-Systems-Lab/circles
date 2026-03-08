"use client";

import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
    getWelcomeSystemMessageTemplateAction,
    saveWelcomeSystemMessageTemplateAction,
} from "@/components/modules/admin/actions";

export default function SystemMessagesTab() {
    const [isLoading, setIsLoading] = useState(true);
    const [title, setTitle] = useState("");
    const [bodyMarkdown, setBodyMarkdown] = useState("");
    const [repliesDisabled, setRepliesDisabled] = useState(true);
    const [version, setVersion] = useState("");
    const [templateSource, setTemplateSource] = useState<"db" | "fallback">("fallback");
    const [senderCircleHandle, setSenderCircleHandle] = useState("kamooni");
    const [isSaving, startSaving] = useTransition();
    const [isPreviewing, startPreviewing] = useTransition();

    const loadTemplate = async () => {
        setIsLoading(true);
        try {
            const result = await getWelcomeSystemMessageTemplateAction();
            if (!result.success) {
                toast.error(result.message || "Failed to load welcome template.");
                return;
            }

            if (!result.draft) {
                toast.error("Template payload is missing.");
                return;
            }

            setTitle(result.draft.title || "");
            setBodyMarkdown(result.draft.bodyMarkdown || "");
            setRepliesDisabled(result.draft.repliesDisabled ?? true);
            setVersion(result.draft.version || "");
            setTemplateSource(result.templateSource || "fallback");
            setSenderCircleHandle(result.draft.senderCircleHandle || "kamooni");
        } catch (error) {
            toast.error("Failed to load welcome template.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadTemplate();
    }, []);

    const handleSave = () => {
        const trimmedTitle = title.trim();
        const trimmedBody = bodyMarkdown.trim();
        if (!trimmedTitle) {
            toast.error("Title is required.");
            return;
        }
        if (!trimmedBody) {
            toast.error("Message body is required.");
            return;
        }

        startSaving(async () => {
            const result = await saveWelcomeSystemMessageTemplateAction({
                title: trimmedTitle,
                bodyMarkdown: trimmedBody,
                repliesDisabled,
                isActive: true,
            });

            if (!result.success) {
                toast.error(result.message || "Failed to save template.");
                return;
            }

            setVersion(result.template?.version || version);
            setTemplateSource("db");
            toast.success("Welcome message saved.");
        });
    };

    const handlePreview = () => {
        startPreviewing(async () => {
            try {
                const response = await fetch("/api/system/welcome-preview", { method: "POST" });
                const data = await response.json().catch(() => ({}));

                if (!response.ok || !data?.success) {
                    toast.error(data?.error || "Failed to send preview.");
                    return;
                }

                toast.success("Preview sent to your chat inbox.");
            } catch (error) {
                toast.error("Failed to send preview.");
            }
        });
    };

    if (isLoading) {
        return <div className="text-sm text-muted-foreground">Loading welcome template...</div>;
    }

    return (
        <div className="max-w-3xl space-y-4">
            <p className="text-sm text-muted-foreground">
                Edit the signup welcome message template. Sender uses circle handle <b>{senderCircleHandle}</b>.
            </p>
            {templateSource === "fallback" && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    No DB template is saved yet. You are editing fallback defaults. Saving will create the DB template.
                </p>
            )}
            <div className="space-y-2">
                <Label htmlFor="welcome-title">Thread Title</Label>
                <Input id="welcome-title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="welcome-body">Body (Markdown)</Label>
                <Textarea
                    id="welcome-body"
                    rows={18}
                    value={bodyMarkdown}
                    onChange={(event) => setBodyMarkdown(event.target.value)}
                    className="font-mono text-sm"
                />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
                <div className="space-y-1">
                    <Label htmlFor="welcome-replies">Disable Replies</Label>
                    <p className="text-sm text-muted-foreground">Keep this thread read-only for recipients.</p>
                </div>
                <Switch id="welcome-replies" checked={repliesDisabled} onCheckedChange={setRepliesDisabled} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save Welcome Template"}
                </Button>
                <Button variant="outline" onClick={handlePreview} disabled={isPreviewing}>
                    {isPreviewing ? "Sending..." : "Preview to Self"}
                </Button>
                <span className="text-xs text-muted-foreground">Version: {version || "n/a"}</span>
            </div>
        </div>
    );
}
