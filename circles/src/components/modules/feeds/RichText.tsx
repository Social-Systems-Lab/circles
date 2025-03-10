"use client";

import { ContentPreviewData, MentionDisplay } from "@/models/models";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HoverCard } from "@/components/ui/hover-card";
import { HoverCardTrigger } from "@radix-ui/react-hover-card";
import { contentPreviewAtom, sidePanelContentVisibleAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { memo, useMemo, useCallback } from "react";

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

    const openMention = useCallback(() => {
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

                return <a {...props} />;
            },
        };
    }, [mentions]);

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
