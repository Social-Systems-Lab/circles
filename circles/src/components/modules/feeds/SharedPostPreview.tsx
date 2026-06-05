"use client";

import Link from "next/link";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FundingAskDisplay, PostDisplay } from "@/models/models";
import { truncateText } from "@/lib/utils";

type SharedPostPreviewProps = {
    post?: PostDisplay | null;
    fallbackText?: string;
};

function getFundingPreviewImageUrl(post: PostDisplay): string | undefined {
    if (post.internalPreviewType !== "funding" || !post.internalPreviewData) {
        return undefined;
    }

    const fundingPreview = post.internalPreviewData as FundingAskDisplay;
    return fundingPreview.coverImage?.url;
}

export default function SharedPostPreview({
    post,
    fallbackText = "Original post unavailable.",
}: SharedPostPreviewProps) {
    if (!post) {
        return (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                {fallbackText}
            </div>
        );
    }

    const href = (() => {
        if (post.internalPreviewType === "funding" && post.internalPreviewUrl) {
            try {
                const parsed = new URL(post.internalPreviewUrl, "http://dummybase");
                return `${parsed.pathname}${parsed.search}${parsed.hash}` || post.internalPreviewUrl;
            } catch {
                return post.internalPreviewUrl;
            }
        }

        if (post.circle?.handle) {
            return `/circles/${post.circle.handle}/post/${post._id}`;
        }

        return undefined;
    })();
    const previewImage = post.media?.[0];
    const fundingPreviewImage = getFundingPreviewImageUrl(post);
    const content = (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition-colors hover:bg-gray-100/80">
            {previewImage?.fileInfo?.url || fundingPreviewImage ? (
                <div className="relative h-44 w-full bg-gray-100">
                    <Image
                        src={previewImage?.fileInfo?.url || fundingPreviewImage!}
                        alt={previewImage?.name || post.title || "Shared post image"}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                    />
                </div>
            ) : null}
            <div className="p-4">
                <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10 rounded-full">
                        <AvatarImage src={post.author?.picture?.url} alt={post.author?.name} />
                        <AvatarFallback>{post.author?.name?.charAt(0) || "?"}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-500">
                            Original post by {post.author?.name}
                            {post.circle?.name ? ` in ${post.circle.name}` : ""}
                        </div>
                        {post.title ? (
                            <div className="mt-1 font-medium text-gray-900">{truncateText(post.title, 120)}</div>
                        ) : null}
                        <div className="mt-1 text-sm text-gray-700">{truncateText(post.content || "", 220)}</div>
                    </div>
                </div>
            </div>
        </div>
    );

    if (!href) {
        return content;
    }

    return <Link href={href}>{content}</Link>;
}
