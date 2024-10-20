"use client";

import { ContentPreviewData, MentionDisplay } from "@/models/models";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HoverCard } from "@/components/ui/hover-card";
import { HoverCardTrigger } from "@radix-ui/react-hover-card";
import { contentPreviewAtom, sidePanelContentVisibleAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";

type MentionHoverCardProps = {
    mention: MentionDisplay;
    children: React.ReactNode;
};

export const MentionHoverCard = ({ mention, children }: MentionHoverCardProps) => {
    const [contentPreview, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);

    const openMention = () => {
        // open content preview
        let contentPreviewData: ContentPreviewData = {
            type: "circle",
            content: mention.circle!,
        };
        setContentPreview((x) =>
            x?.content === mention.circle && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );
    };

    return (
        <span className="cursor-pointer font-semibold" onClick={openMention}>
            {children}
        </span>
    );
};

type RichTextProps = {
    content: string;
    mentions?: MentionDisplay[];
};

const RichText = ({ content, mentions }: RichTextProps) => {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={
                mentions && mentions.length > 0
                    ? {
                          a: ({ node, ...props }) => {
                              const href = props.href || "";
                              console.log("href", href);

                              const mentionMatch = href.match(/^\/circles\/(.+)/);

                              if (mentionMatch) {
                                  const mentionId = mentionMatch[1];
                                  const mention = mentions.find((c) => c.id === mentionId);

                                  console.log("found mention", mention);

                                  if (mention) {
                                      return <MentionHoverCard mention={mention}>{props.children}</MentionHoverCard>;
                                  }
                              }

                              return <a {...props} />;
                          },
                      }
                    : undefined
            }
        >
            {content}
        </ReactMarkdown>
    );
};

export default RichText;
