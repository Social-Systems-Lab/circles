"use client";

import { useState, useTransition } from "react";
import { ImageIcon, Loader2, Send, X } from "lucide-react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { ImageItem, MultiImageUploader } from "@/components/forms/controls/multi-image-uploader";
import { Circle, Feed } from "@/models/models";
import { createPostAction } from "@/components/modules/feeds/actions";
import { UserPicture } from "@/components/modules/members/user-picture";
import type { ParticipationBlockReason } from "@/lib/profile-completion";
import { CommunityReadinessDialog, getCommunityReadinessCopy } from "./community-readiness-dialog";

type CommunityComposerProps = {
    circle: Circle;
    feed: Feed;
    onCreated: () => void;
    participationBlockReason?: ParticipationBlockReason | null;
};

export function CommunityComposer({ circle, feed, onCreated, participationBlockReason = null }: CommunityComposerProps) {
    const [user] = useAtom(userAtom);
    const [isExpanded, setIsExpanded] = useState(false);
    const [content, setContent] = useState("");
    const [images, setImages] = useState<ImageItem[]>([]);
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const reset = () => {
        setContent("");
        setImages([]);
        setIsExpanded(false);
    };

    const handleSubmit = () => {
        const hasText = content.trim().length > 0;
        const files = images.filter((image) => image.file);
        if (!hasText && files.length === 0) {
            toast({
                title: "Add a message or image",
                variant: "destructive",
            });
            return;
        }

        startTransition(async () => {
            const formData = new FormData();
            formData.append("circleId", circle._id);
            formData.append("feedId", feed._id);
            formData.append("postType", "community");
            formData.append("content", content.trim());
            formData.append("userGroups", "everyone");
            files.forEach((image) => {
                formData.append("media", image.file!);
            });

            const response = await createPostAction(formData);
            if (!response.success) {
                toast({
                    title: response.message || "Failed to post to Community",
                    variant: "destructive",
                });
                return;
            }

            reset();
            onCreated();
        });
    };

    if (!user) {
        return null;
    }

    if (participationBlockReason) {
        const copy = getCommunityReadinessCopy(participationBlockReason);
        const profileHref = user.handle ? `/circles/${user.handle}/home` : "/circles";

        return (
            <div className="mb-4 w-full rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <CommunityReadinessDialog reason={participationBlockReason} profileHref={profileHref}>
                    <button type="button" className="flex w-full items-center gap-3 text-left">
                        <UserPicture name={user.name} picture={user.picture?.url} size="40px" />
                        <span className="flex-1 rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900">
                            {copy.placeholder}
                        </span>
                    </button>
                </CommunityReadinessDialog>
            </div>
        );
    }

    return (
        <div className="mb-4 w-full rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            {!isExpanded ? (
                <button
                    type="button"
                    className="flex w-full items-center gap-3 text-left"
                    onClick={() => setIsExpanded(true)}
                >
                    <UserPicture name={user.name} picture={user.picture?.url} size="40px" />
                    <span className="flex-1 rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-500">
                        Share something with the community
                    </span>
                </button>
            ) : (
                <div className="flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                        <UserPicture name={user.name} picture={user.picture?.url} size="40px" />
                        <Textarea
                            value={content}
                            onChange={(event) => setContent(event.target.value)}
                            placeholder="Share something with the community"
                            className="min-h-[96px] resize-none border-0 bg-gray-50 text-base shadow-none focus-visible:ring-1"
                            autoFocus
                        />
                    </div>
                    <MultiImageUploader
                        onChange={setImages}
                        previewMode="compact"
                        maxImages={10}
                        dropzoneClassName="p-4"
                    />
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <ImageIcon className="h-4 w-4" />
                            <span>{images.length} image{images.length === 1 ? "" : "s"} selected</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={isPending}>
                                <X className="mr-1 h-4 w-4" />
                                Cancel
                            </Button>
                            <Button type="button" size="sm" onClick={handleSubmit} disabled={isPending}>
                                {isPending ? (
                                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="mr-1 h-4 w-4" />
                                )}
                                Post
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
