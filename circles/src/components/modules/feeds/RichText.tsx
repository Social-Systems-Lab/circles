"use client";

import { ContentPreviewData, MentionDisplay } from "@/models/models";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HoverCard } from "@/components/ui/hover-card";
import { HoverCardTrigger } from "@radix-ui/react-hover-card";
import { contentPreviewAtom, sidePanelContentVisibleAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { memo, useMemo, useCallback, ComponentProps } from "react"; // Added ComponentProps
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { useRouter } from "next/navigation";
import Link from "next/link"; // Import Next Link

const needsMarkdown = (content: string): boolean => {
    // Check for common markdown syntax
    const markdownPatterns = [
        /[*_~`]/, // Basic formatting
        /\[.*?\]\(.*?\)/, // Links
        /^\s*[-*+]\s/, // Lists
        /^\s*#{1,6}\s/, // Headers
        /^\s*>\s/, // Blockquotes
        /\|.*\|/, // Tables
        /```/, // Code blocks
        /^\s*\d+\.\s/, // Numbered lists
    ];

    return markdownPatterns.some((pattern) => pattern.test(content));
};

type MentionHoverCardProps = {
    mention: MentionDisplay;
    children: React.ReactNode;
};

const MentionHoverCard = memo(({ mention, children }: MentionHoverCardProps) => {
    const [, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const isMobile = useIsMobile();
    const router = useRouter();

    const openMention = useCallback(() => {
        if (isMobile) {
            // Otherwise use the standard route
            if (mention.circle?.handle) {
                router.push(`/circles/${mention.circle.handle}`);
            }
            return;
        }

        let contentPreviewData: ContentPreviewData = {
            type: "circle",
            content: mention.circle!,
        };
        setContentPreview((x) =>
            x?.content === mention.circle && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );
    }, [mention.circle, setContentPreview, sidePanelContentVisible]);

    return (
        <span className="cursor-pointer font-semibold" onClick={openMention}>
            {children}
        </span>
    );
});

MentionHoverCard.displayName = "MentionHoverCard";

type RichTextProps = {
    content: string;
    mentions?: MentionDisplay[];
};

const RichText = memo(({ content, mentions }: RichTextProps) => {
    const requiresMarkdown = useMemo(() => needsMarkdown(content), [content]);
    const hasMentions = mentions && mentions.length > 0;

    const components = useMemo(() => {
        if (!mentions || mentions.length === 0) return undefined;

        return {
            a: ({ node, ...props }: { node: HTMLElement; [key: string]: any }) => {
                const href = props.href || "";
                const mentionMatch = href.match(/^\/circles\/(.+)/);

                if (mentionMatch) {
                    const mentionId = mentionMatch[1];
                    const mention = mentions.find((c) => c.id === mentionId);

                    if (mention) {
                        return <MentionHoverCard mention={mention}>{props.children}</MentionHoverCard>;
                    }
                }

                // Check if it's an external link (starts with http/https)
                if (href.startsWith("http://") || href.startsWith("https://")) {
                    return (
                        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                            {props.children}
                        </a>
                    );
                }

                // Handle internal links (like mentions, potentially others)
                // For now, assume internal links are handled by MentionHoverCard or default Next Link behavior
                // If it's not a mention, render as a Next Link for internal navigation
                return (
                    <Link href={href} {...props}>
                        {props.children}
                    </Link>
                );
            },
        };
    }, [mentions]); // Keep mentions dependency for MentionHoverCard

    // If no markdown or mentions, just render plain text
    if (!requiresMarkdown && !hasMentions) {
        return <div className="whitespace-pre-wrap">{content}</div>;
    }

    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {content}
        </ReactMarkdown>
    );
});

RichText.displayName = "RichText";

export default RichText;
