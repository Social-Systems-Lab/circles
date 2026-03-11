"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
    broadcastPlatformBroadcastMessageAction,
    getPlatformBroadcastMessageAction,
    getWelcomeSystemMessageTemplateAction,
    savePlatformBroadcastMessageAction,
    getWelcomeBannerAction,
    saveWelcomeBannerAction,
    saveWelcomeSystemMessageTemplateAction,
    previewPlatformBroadcastMessageToSelfAction,
} from "@/components/modules/admin/actions";
import type { PlatformBannerType } from "@/config/platform-banner";

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
    const [broadcastBody, setBroadcastBody] = useState("");
    const [broadcastIsActive, setBroadcastIsActive] = useState(false);
    const [broadcastUpdatedAt, setBroadcastUpdatedAt] = useState<string | null>(null);
    const [isSavingBroadcast, startSavingBroadcast] = useTransition();
    const [isPreviewingBroadcast, startPreviewingBroadcast] = useTransition();
    const [isBroadcastingBroadcast, startBroadcastingBroadcast] = useTransition();
    const [bannerType, setBannerType] = useState<PlatformBannerType>("alert");
    const [bannerText, setBannerText] = useState("");
    const [bannerCtaEnabled, setBannerCtaEnabled] = useState(false);
    const [bannerCtaLabel, setBannerCtaLabel] = useState("");
    const [bannerCtaUrl, setBannerCtaUrl] = useState("");
    const [bannerIsActive, setBannerIsActive] = useState(true);
    const [bannerSource, setBannerSource] = useState<"db" | "fallback">("fallback");
    const [bannerUpdatedAt, setBannerUpdatedAt] = useState<string | null>(null);
    const [isSavingBanner, startSavingBanner] = useTransition();
    const broadcastBodyRef = useRef<HTMLTextAreaElement>(null);

    const insertBroadcastMarkdown = (
        formatter: (selectedText: string) => {
            insertText: string;
            selectionStartOffset?: number;
            selectionEndOffset?: number;
        },
    ) => {
        const textarea = broadcastBodyRef.current;
        if (!textarea) {
            return;
        }

        const start = textarea.selectionStart ?? 0;
        const end = textarea.selectionEnd ?? 0;
        const selectedText = broadcastBody.slice(start, end);
        const before = broadcastBody.slice(0, start);
        const after = broadcastBody.slice(end);
        const { insertText, selectionStartOffset, selectionEndOffset } = formatter(selectedText);
        const nextValue = `${before}${insertText}${after}`;
        const nextSelectionStart =
            selectionStartOffset === undefined ? before.length + insertText.length : before.length + selectionStartOffset;
        const nextSelectionEnd =
            selectionEndOffset === undefined ? nextSelectionStart : before.length + selectionEndOffset;

        setBroadcastBody(nextValue);

        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
        });
    };

    const wrapBroadcastSelection = (prefix: string, suffix: string, placeholder: string) => {
        insertBroadcastMarkdown((selectedText) => {
            const value = selectedText || placeholder;
            return {
                insertText: `${prefix}${value}${suffix}`,
                selectionStartOffset: prefix.length,
                selectionEndOffset: prefix.length + value.length,
            };
        });
    };

    const insertBroadcastBulletList = () => {
        insertBroadcastMarkdown((selectedText) => {
            if (!selectedText) {
                const listText = "- item 1\n- item 2";
                return { insertText: listText };
            }

            const lines = selectedText.split("\n");
            const listText = lines.map((line) => (line.trim() ? `- ${line}` : "- ")).join("\n");
            return { insertText: listText };
        });
    };

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [templateResult, broadcastResult, bannerResult] = await Promise.all([
                getWelcomeSystemMessageTemplateAction(),
                getPlatformBroadcastMessageAction(),
                getWelcomeBannerAction(),
            ]);

            if (!templateResult.success) {
                toast.error(templateResult.message || "Failed to load welcome template.");
            } else if (templateResult.draft) {
                setTitle(templateResult.draft.title || "");
                setBodyMarkdown(templateResult.draft.bodyMarkdown || "");
                setRepliesDisabled(templateResult.draft.repliesDisabled ?? true);
                setVersion(templateResult.draft.version || "");
                setTemplateSource(templateResult.templateSource || "fallback");
                setSenderCircleHandle(templateResult.draft.senderCircleHandle || "kamooni");
            } else {
                toast.error("Template payload is missing.");
            }

            if (!broadcastResult.success) {
                toast.error(broadcastResult.message || "Failed to load platform broadcast message.");
            } else if (broadcastResult.draft) {
                setBroadcastBody(broadcastResult.draft.body || "");
                setBroadcastIsActive(broadcastResult.draft.active === true);
                setBroadcastUpdatedAt(broadcastResult.draft.updatedAt || null);
            } else {
                setBroadcastBody("");
                setBroadcastIsActive(false);
                setBroadcastUpdatedAt(null);
            }

            if (!bannerResult.success) {
                toast.error(bannerResult.message || "Failed to load welcome banner.");
            } else if (bannerResult.draft) {
                setBannerType(bannerResult.draft.type || "alert");
                setBannerText(bannerResult.draft.text || "");
                setBannerCtaEnabled(bannerResult.draft.ctaEnabled ?? false);
                setBannerCtaLabel(bannerResult.draft.ctaLabel || "");
                setBannerCtaUrl(bannerResult.draft.ctaUrl || "");
                setBannerIsActive(bannerResult.draft.isActive ?? true);
                setBannerSource(bannerResult.bannerSource || "fallback");
                setBannerUpdatedAt(bannerResult.draft.updatedAt || null);
            } else {
                toast.error("Banner payload is missing.");
            }
        } catch (error) {
            toast.error("Failed to load system message settings.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
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

    const handleBroadcastSave = () => {
        const trimmedBody = broadcastBody.trim();
        if (!trimmedBody) {
            toast.error("Platform broadcast message body is required.");
            return;
        }

        startSavingBroadcast(async () => {
            const result = await savePlatformBroadcastMessageAction({
                body: trimmedBody,
                active: false,
            });

            if (!result.success) {
                toast.error(result.message || "Failed to save platform broadcast message.");
                return;
            }

            if (result.draft) {
                setBroadcastBody(result.draft.body || "");
                setBroadcastIsActive(result.draft.active === true);
                setBroadcastUpdatedAt(result.draft.updatedAt || null);
            }
            toast.success("Platform broadcast draft saved.");
        });
    };

    const handleBroadcastPreviewToSelf = () => {
        const trimmedBody = broadcastBody.trim();
        if (!trimmedBody) {
            toast.error("Platform broadcast message body is required.");
            return;
        }

        startPreviewingBroadcast(async () => {
            const result = await previewPlatformBroadcastMessageToSelfAction(trimmedBody);
            if (!result.success) {
                toast.error(result.message || "Failed to preview platform broadcast message.");
                return;
            }

            toast.success("Preview sent to your Platform Announcements chat.");
        });
    };

    const handleBroadcastSend = () => {
        const trimmedBody = broadcastBody.trim();
        if (!trimmedBody) {
            toast.error("Platform broadcast message body is required.");
            return;
        }

        startBroadcastingBroadcast(async () => {
            const result = await broadcastPlatformBroadcastMessageAction(trimmedBody);
            if (!result.success) {
                toast.error(result.message || "Failed to broadcast platform message.");
                return;
            }

            if (result.draft) {
                setBroadcastBody(result.draft.body || "");
                setBroadcastIsActive(result.draft.active === true);
                setBroadcastUpdatedAt(result.draft.updatedAt || null);
            }
            toast.success("Platform broadcast sent to all users.");
        });
    };

    const handleBannerSave = () => {
        const trimmedText = bannerText.trim();
        if (!trimmedText) {
            toast.error("Banner text is required.");
            return;
        }

        startSavingBanner(async () => {
            const result = await saveWelcomeBannerAction({
                type: bannerType,
                text: trimmedText,
                ctaEnabled: bannerCtaEnabled,
                ctaLabel: bannerCtaLabel.trim(),
                ctaUrl: bannerCtaUrl.trim(),
                isActive: bannerIsActive,
            });

            if (!result.success) {
                toast.error(result.message || "Failed to save banner.");
                return;
            }

            setBannerSource("db");
            setBannerUpdatedAt(result.banner?.updatedAt || null);
            toast.success("Welcome banner saved.");
        });
    };

    if (isLoading) {
        return <div className="text-sm text-muted-foreground">Loading system messages...</div>;
    };

    return (
        <div className="max-w-3xl space-y-8">
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Edit the signup welcome message template. Sender uses circle handle <b>{senderCircleHandle}</b>.
                </p>
                {templateSource === "fallback" && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        No DB template is saved yet. You are editing fallback defaults. Saving will create the DB
                        template.
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

            <div className="space-y-4 border-t pt-6">
                <h3 className="text-lg font-semibold">Platform Broadcast (Chat)</h3>
                <p className="text-sm text-muted-foreground">
                    Save stores a draft only. Preview sends to you only. Broadcast sends to all users.
                </p>
                <div className="space-y-2">
                    <Label htmlFor="platform-broadcast-body">Message (Markdown)</Label>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => wrapBroadcastSelection("**", "**", "bold text")}
                        >
                            Bold
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => wrapBroadcastSelection("*", "*", "italic text")}
                        >
                            Italic
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => wrapBroadcastSelection("[", "](https://example.com)", "link text")}
                        >
                            Link
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={insertBroadcastBulletList}>
                            Bullet List
                        </Button>
                    </div>
                    <Textarea
                        ref={broadcastBodyRef}
                        id="platform-broadcast-body"
                        rows={5}
                        value={broadcastBody}
                        onChange={(event) => setBroadcastBody(event.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={handleBroadcastSave} disabled={isSavingBroadcast || isBroadcastingBroadcast}>
                        {isSavingBroadcast ? "Saving..." : "Save"}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleBroadcastPreviewToSelf}
                        disabled={isPreviewingBroadcast || isBroadcastingBroadcast}
                    >
                        {isPreviewingBroadcast ? "Sending..." : "Preview to Self"}
                    </Button>
                    <Button onClick={handleBroadcastSend} disabled={isBroadcastingBroadcast || isSavingBroadcast}>
                        {isBroadcastingBroadcast ? "Broadcasting..." : "Broadcast"}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                        Status: {broadcastIsActive ? "broadcasted" : "draft"}
                    </span>
                    {broadcastUpdatedAt && (
                        <span className="text-xs text-muted-foreground">
                            Updated: {new Date(broadcastUpdatedAt).toLocaleString()}
                        </span>
                    )}
                </div>
            </div>

            <div className="space-y-4 border-t pt-6">
                <h3 className="text-lg font-semibold">Landing Welcome Banner</h3>
                <p className="text-sm text-muted-foreground">
                    Configure the banner shown on the welcome landing page. If inactive, the hardcoded fallback copy is
                    shown.
                </p>
                {bannerSource === "fallback" && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        No DB banner is saved yet. Saving here will create it.
                    </p>
                )}
                <div className="space-y-2">
                    <Label htmlFor="banner-type">Banner Type</Label>
                    <Select value={bannerType} onValueChange={(value) => setBannerType(value as PlatformBannerType)}>
                        <SelectTrigger id="banner-type">
                            <SelectValue placeholder="Select banner type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="alert">Alert</SelectItem>
                            <SelectItem value="announcement">Announcement</SelectItem>
                            <SelectItem value="cta">CTA</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="space-y-1 text-xs text-muted-foreground">
                        <p>CTA: White background, will display a button</p>
                        <p>Alert: Red background, white text</p>
                        <p>Announcement: Yellow background, white text</p>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="banner-text">Banner Text</Label>
                    <Textarea
                        id="banner-text"
                        rows={4}
                        value={bannerText}
                        onChange={(event) => setBannerText(event.target.value)}
                    />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                    <div className="space-y-1">
                        <Label htmlFor="banner-cta-enabled">Enable CTA Button</Label>
                        <p className="text-sm text-muted-foreground">
                            Shows a centered button when label and URL are also provided.
                        </p>
                    </div>
                    <Switch id="banner-cta-enabled" checked={bannerCtaEnabled} onCheckedChange={setBannerCtaEnabled} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="banner-cta-label">CTA Label (optional)</Label>
                        <Input
                            id="banner-cta-label"
                            value={bannerCtaLabel}
                            onChange={(event) => setBannerCtaLabel(event.target.value)}
                            placeholder="Join now"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="banner-cta-url">CTA URL (optional)</Label>
                        <Input
                            id="banner-cta-url"
                            value={bannerCtaUrl}
                            onChange={(event) => setBannerCtaUrl(event.target.value)}
                            placeholder="/signup or https://example.com"
                        />
                    </div>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                    <div className="space-y-1">
                        <Label htmlFor="banner-active">Banner Active</Label>
                        <p className="text-sm text-muted-foreground">When off, fallback copy is shown on welcome.</p>
                    </div>
                    <Switch id="banner-active" checked={bannerIsActive} onCheckedChange={setBannerIsActive} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={handleBannerSave} disabled={isSavingBanner}>
                        {isSavingBanner ? "Saving..." : "Save Banner"}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                        Updated: {bannerUpdatedAt ? new Date(bannerUpdatedAt).toLocaleString() : "n/a"}
                    </span>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
                    <p className="text-sm">{bannerText || "Banner text preview"}</p>
                    {bannerCtaEnabled && bannerCtaLabel.trim() && bannerCtaUrl.trim() && (
                        <div className="mt-3 flex justify-center">
                            <Button variant="outline" size="sm">
                                {bannerCtaLabel.trim()}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
