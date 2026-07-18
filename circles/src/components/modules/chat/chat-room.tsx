//chat-room.tsx - chat room component, shows chat messages and input
"use client";

import { Dispatch, KeyboardEvent, SetStateAction, useCallback, useMemo, useTransition } from "react";
import { Circle, ChatMessage, ChatRoomDisplay, ReactionAggregation } from "@/models/models";
import {
    mapOpenAtom,
    replyToMessageAtom,
    roomMessagesAtom,
    userAtom,
    unreadCountsAtom,
    lastReadTimestampsAtom,
} from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { CirclePicture } from "../circles/circle-picture";
import RichText from "../feeds/RichText";
import { Mention, MentionsInput } from "react-mentions";
import { defaultMentionsInputStyle, defaultMentionStyle } from "../feeds/post-list";
import { useIsCompact } from "@/components/utils/use-is-compact";
import {
    deleteMongoMessageAction,
    editMessageAction,
    getChatRoomMembersAction,
    sendAttachmentAction,
    sendMessageAction,
    toggleMongoReactionAction,
} from "./actions";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    IoArrowBack,
    IoArrowDown,
    IoClose,
    IoChevronDown,
    IoChevronForward,
    IoSend,
    IoAddCircleOutline,
    IoAttach,
    IoDocumentText,
    IoTimeOutline,
    IoWarningOutline,
} from "react-icons/io5";
import { HiLightBulb } from "react-icons/hi";
import { MdReply } from "react-icons/md";
import { BsEmojiSmile } from "react-icons/bs";
import { GrEdit, GrTrash } from "react-icons/gr";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { generateColorFromString } from "@/lib/utils/color";
import { EmojiClickData } from "emoji-picker-react";
import LazyEmojiPicker from "./LazyEmojiPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MemoizedReactMarkdown } from "@/components/utils/memoized-markdown";
import { useMongoChat } from "./useMongoChat";
import {
    acceptConnectRequestAction,
    declineConnectRequestAction,
    getProfileRelationshipStateAction,
    sendConnectRequestAction,
} from "@/components/modules/home/actions";
import { useToast } from "@/components/ui/use-toast";
import { getInitialTopicTitle, getTopicCreationTime, getTopicIndexMessages } from "./chat-topic-utils";
import { dispatchNotificationRefresh, dispatchNotificationRefreshIfOk } from "@/lib/client/notification-events";
import {
    getLegacyLooseMessages,
    shouldFetchLegacyLooseMessagesOnExpand,
    shouldShowLegacyLooseMessageSection,
} from "@/lib/chat/legacy-messages";

export const renderCircleSuggestion = (
    suggestion: any,
    search: string,
    highlightedDisplay: React.ReactNode,
    index: number,
    focused: boolean,
) => (
    <div className="flex items-center p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
            src={suggestion.picture || "/default-profile.png"}
            alt={suggestion.display}
            className="mr-2 h-6 w-6 rounded-full"
        />
        <span>{highlightedDisplay}</span>
    </div>
);

const CHAT_MENTION_MARKUP_REGEX = /\[([^\]]+)\]\(\/circles\/([^)]+)\)/g;
const CHAT_MENTION_MARKUP_TEST_REGEX = /\[[^\]]+\]\(\/circles\/[^)]+\)/;
const CHAT_MENTION_LINK_HREF_REGEX = /^\/circles\/[^/\s?#]+(?:[?#].*)?$/i;
const CHAT_BOTTOM_THRESHOLD_PX = 150;
const CHAT_TOPIC_BACKGROUND_CLASS = "border border-[#DDEBB8] bg-[#F1F6DF]";
const CHAT_STANDARD_BUBBLE_CLASS = "border border-gray-200 bg-white";
const CHAT_MESSAGE_ELEMENT_ID_PREFIX = "chat-message-";
const CHAT_MESSAGE_HIGHLIGHT_CLASSES = ["ring-2", "ring-blue-300", "ring-offset-2", "ring-offset-white"];

const renderMentionsAsDisplayText = (content: string) => content.replace(CHAT_MENTION_MARKUP_REGEX, "$1");
const isChatMentionLinkHref = (href?: string) => !!href && CHAT_MENTION_LINK_HREF_REGEX.test(href);

const getTopicCreationDate = (message: Pick<ChatMessage, "createdAt"> & Record<string, any>): Date | null => {
    const rawDate = message.thread?.createdAt || message.createdAt;
    const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
    return Number.isNaN(date.getTime()) ? null : date;
};

const formatTopicHeaderDate = (message: Pick<ChatMessage, "createdAt"> & Record<string, any>): string => {
    const date = getTopicCreationDate(message);
    if (!date) return "Date unavailable";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const formatCompactDisplayName = (name?: string | null, fallback?: string | null): string => {
    const rawName = (name || fallback || "Unknown").trim();
    if (!rawName) return "Unknown";

    const parts = rawName.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return rawName;

    const firstName = parts[0];
    const lastInitial = parts[parts.length - 1]?.charAt(0);
    return lastInitial ? `${firstName} ${lastInitial.toUpperCase()}.` : firstName;
};

const isSameCalendarDate = (left: Date, right: Date): boolean =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();

const formatTopicPostTimestamp = (date: Date, includeDate: boolean): string => {
    if (Number.isNaN(date.getTime())) return "";
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    if (!includeDate) return time;
    const compactDate = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${compactDate}, ${time}`;
};

type MentionSuggestion = {
    id: string;
    display: string;
    picture?: string;
    handle?: string;
};

const getChatMentionSuggestions = (mentionCandidates: Circle[]): MentionSuggestion[] => {
    const seen = new Set<string>();
    const suggestions: MentionSuggestion[] = [];

    for (const candidate of mentionCandidates || []) {
        const idValue = candidate?.handle || candidate?.did || candidate?._id;
        const display = candidate?.name;
        if (!idValue || !display) {
            continue;
        }

        const dedupeKey = String(candidate?.did || candidate?._id || candidate?.handle || idValue);
        if (seen.has(dedupeKey)) {
            continue;
        }
        seen.add(dedupeKey);

        suggestions.push({
            id: String(idValue),
            display: String(display),
            ...(candidate?.picture?.url ? { picture: candidate.picture.url } : {}),
            ...(candidate?.handle ? { handle: candidate.handle } : {}),
        });
    }

    return suggestions;
};

const queryChatMentionSuggestions = (
    mentionSuggestions: MentionSuggestion[],
    query: string,
    callback: (data: MentionSuggestion[]) => void,
) => {
    if (!mentionSuggestions.length) {
        callback([]);
        return;
    }

    const term = query.trim().toLowerCase();
    if (!term) {
        callback(mentionSuggestions);
        return;
    }

    callback(
        mentionSuggestions.filter((suggestion) => {
            const displayMatch = suggestion.display.toLowerCase().includes(term);
            const handleMatch = suggestion.handle?.toLowerCase().includes(term);
            const idMatch = suggestion.id.toLowerCase().includes(term);
            return displayMatch || !!handleMatch || idMatch;
        }),
    );
};

type DmConnectBannerState = Awaited<ReturnType<typeof getProfileRelationshipStateAction>>;

const isPlatformAnnouncementMessage = (message: ChatMessage): boolean =>
    message.system?.messageType === "system" &&
    message.system?.systemType === "announcement" &&
    (message.system?.source === "platform_admin" ||
        (typeof (message as any)?.broadcastId === "string" && ((message as any).broadcastId as string).length > 0));

const isNonPreviewSystemSenderMessage = (message: ChatMessage): boolean => {
    if (message.system?.messageType !== "system") return false;
    if (message.system?.systemType === "welcome") return true;
    return isPlatformAnnouncementMessage(message);
};

const renderFormattedChatBody = (
    body: string,
    options?: {
        format?: string;
        shouldEmphasizeLinks?: boolean;
        markdownClassName?: string;
    },
) => {
    const isMarkdown = options?.format === "markdown";
    const hasMentionMarkup = CHAT_MENTION_MARKUP_TEST_REGEX.test(body);
    const shouldEmphasizeLinks = options?.shouldEmphasizeLinks === true;

    if (isMarkdown || hasMentionMarkup) {
        return (
            <MemoizedReactMarkdown
                className={
                    options?.markdownClassName ||
                    (shouldEmphasizeLinks ? "formatted max-w-none text-sm leading-relaxed" : "formatted")
                }
                components={{
                    a: ({ href, className, ...props }) => (
                        <a
                            href={href}
                            className={
                                isChatMentionLinkHref(href)
                                    ? `inline font-semibold text-[hsl(var(--task-link))] no-underline hover:text-[hsl(var(--task-link-hover))] hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--task-link))] ${className ?? ""}`.trim()
                                    : `${shouldEmphasizeLinks ? "text-[hsl(var(--task-link))] underline underline-offset-2 hover:text-[hsl(var(--task-link-hover))]" : ""} ${className ?? ""}`.trim()
                            }
                            {...props}
                        />
                    ),
                }}
            >
                {body}
            </MemoizedReactMarkdown>
        );
    }

    return <RichText content={body} className="formatted" />;
};

type ChatAttachmentLike = {
    url: string;
    name?: string;
    mimeType?: string;
};

const getMessageElementId = (messageId?: string) =>
    messageId ? `${CHAT_MESSAGE_ELEMENT_ID_PREFIX}${messageId}` : undefined;

const getMessageAttachments = (message?: Partial<ChatMessage>) =>
    (((message as any)?.attachments as ChatAttachmentLike[] | undefined) || []).filter((attachment) => attachment?.url);

const getFirstImageAttachment = (message?: Partial<ChatMessage>) =>
    getMessageAttachments(message).find((attachment) => attachment.mimeType?.startsWith("image/"));

const getReplyPreviewLabel = (replyTo?: Partial<ChatMessage>) => {
    const body = renderMentionsAsDisplayText((replyTo?.content?.body as string) || "").trim();
    if (body) return body;

    const firstAttachment = getMessageAttachments(replyTo)[0];
    if (!firstAttachment) return "";
    if (firstAttachment.mimeType?.startsWith("image/")) return "Photo";
    return firstAttachment.name || "Attachment";
};

const getImageReplyPreviewText = (replyTo?: Partial<ChatMessage>) => {
    const body = renderMentionsAsDisplayText((replyTo?.content?.body as string) || "").trim();
    const imageAttachment = getFirstImageAttachment(replyTo);
    if (!body || !imageAttachment?.name) return body;

    return body === imageAttachment.name ? "" : body;
};

const getImageMessageBodyText = (message: ChatMessage) => {
    const rawBody = ((message?.content?.body as string) || "").trim();
    const displayBody = renderMentionsAsDisplayText(rawBody).trim();
    const imageAttachment = getFirstImageAttachment(message);
    if (!rawBody || !imageAttachment?.name) return rawBody;

    return displayBody === imageAttachment.name ? "" : rawBody;
};

const scrollToMessageElement = (messageId?: string) => {
    const elementId = getMessageElementId(messageId);
    if (!elementId) return;

    const element = document.getElementById(elementId);
    if (!element) return;

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add(...CHAT_MESSAGE_HIGHLIGHT_CLASSES);
    window.setTimeout(() => {
        element.classList.remove(...CHAT_MESSAGE_HIGHLIGHT_CLASSES);
    }, 1800);
};

const ReplyReferencePreview: React.FC<{
    replyTo?: Partial<ChatMessage>;
    inlineAuthor?: string;
    inlineText?: string;
    authorColor: string;
    className?: string;
}> = ({ replyTo, inlineAuthor, inlineText, authorColor, className }) => {
    const originalAuthor = inlineAuthor || replyTo?.author?.name || replyTo?.author?._id || "";
    const imageAttachment = getFirstImageAttachment(replyTo);
    const previewLabel = inlineText || getReplyPreviewLabel(replyTo);
    const imagePreviewText = inlineText || getImageReplyPreviewText(replyTo);
    const isClickable = !!replyTo?.id;
    const Wrapper = isClickable ? "button" : "div";

    return (
        <Wrapper
            type={isClickable ? "button" : undefined}
            className={`mb-2 w-full rounded-md border border-l-4 border-slate-200 border-l-slate-300 bg-white/80 p-2 pl-2 text-left ${isClickable ? "cursor-pointer transition-colors hover:bg-slate-50 focus:outline-none" : ""} ${className ?? ""}`.trim()}
            onClick={
                isClickable
                    ? (event) => {
                          event.stopPropagation();
                          scrollToMessageElement(replyTo?.id);
                      }
                    : undefined
            }
        >
            <div className="text-xs font-semibold" style={{ color: authorColor }}>
                {originalAuthor}
            </div>
            {imageAttachment ? (
                <div className="mt-1 flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={imageAttachment.url}
                        alt={imageAttachment.name || "Reply image preview"}
                        className="h-10 w-10 shrink-0 rounded-md object-cover"
                    />
                    {imagePreviewText ? <p className="truncate text-sm text-gray-600">{imagePreviewText}</p> : null}
                </div>
            ) : (
                <p className="truncate text-sm text-gray-600">{previewLabel}</p>
            )}
        </Wrapper>
    );
};

const renderChatMessage = (message: ChatMessage, preview?: boolean) => {
    if (preview) {
        return (
            <span>
                <b>{message.author.name}: </b>
                {renderMentionsAsDisplayText((message?.content?.body as string) || "")}
            </span>
        );
    } else {
        const imageMessageBody = getImageMessageBodyText(message);
        const body = typeof imageMessageBody === "string" ? imageMessageBody : (message?.content?.body as string) || "";
        const replyTo = message.replyTo;
        const hasInlineReply = body.includes("\n\n") && body.startsWith("> ");
        const isReply = !!replyTo || hasInlineReply;
        const replyText = hasInlineReply ? body.substring(body.indexOf("\n\n") + 2) : body;
        const originalMessage = hasInlineReply
            ? renderMentionsAsDisplayText(body.substring(body.indexOf("> ") + 2, body.indexOf("\n\n")))
            : getReplyPreviewLabel(replyTo);
        const originalAuthor = hasInlineReply
            ? originalMessage.substring(1, originalMessage.indexOf(">"))
            : replyTo?.author?.name || replyTo?.author?._id || "";
        const originalAuthorColor = generateColorFromString(originalAuthor);
        const shouldEmphasizeLinks = isNonPreviewSystemSenderMessage(message);

        return (
            <div className="max-w-full overflow-hidden">
                {isReply && (
                    <ReplyReferencePreview
                        replyTo={hasInlineReply ? undefined : replyTo}
                        inlineAuthor={hasInlineReply ? originalAuthor : undefined}
                        inlineText={
                            hasInlineReply ? originalMessage.substring(originalMessage.indexOf(">") + 2) : undefined
                        }
                        authorColor={originalAuthorColor}
                    />
                )}
                {renderFormattedChatBody(replyText, {
                    format: (message as any)?.format,
                    shouldEmphasizeLinks,
                })}
            </div>
        );
    }
};

const DmConnectBanner: React.FC<{ chatRoom: ChatRoomDisplay; user?: Circle | null }> = ({ chatRoom, user }) => {
    const { toast } = useToast();
    const [state, setState] = useState<DmConnectBannerState>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isActing, setIsActing] = useState(false);

    const otherParticipant = useMemo(() => {
        if (!(chatRoom as any)?.isDirect || !user?.did) {
            return null;
        }

        const participants = Array.isArray((chatRoom as any)?.participantCircles)
            ? ((chatRoom as any).participantCircles as Circle[])
            : [];
        return participants.find((participant) => participant?.did && participant.did !== user.did) || null;
    }, [chatRoom, user?.did]);

    const loadState = useCallback(async () => {
        if (!otherParticipant?.did) {
            setState(null);
            return;
        }

        setIsLoading(true);
        try {
            setState(await getProfileRelationshipStateAction(otherParticipant.did));
        } catch (error) {
            console.error("Failed to load DM contact state:", error);
            setState(null);
        } finally {
            setIsLoading(false);
        }
    }, [otherParticipant?.did]);

    useEffect(() => {
        void loadState();
    }, [loadState]);

    if (!otherParticipant?.did || !state || state.connectStatus === "accepted") {
        return null;
    }

    const runContactAction = async (action: () => Promise<{ success: boolean; message: string }>, title: string) => {
        setIsActing(true);
        try {
            const result = await action();
            if (!result.success) {
                toast({ title, description: result.message, variant: "destructive" });
                return;
            }
            await loadState();
            toast({ title, description: result.message });
        } catch (error) {
            console.error("Failed to update DM contact state:", error);
            toast({
                title,
                description: error instanceof Error ? error.message : "Failed to update contact request",
                variant: "destructive",
            });
        } finally {
            setIsActing(false);
        }
    };

    const contactName = otherParticipant.name || "this person";

    return (
        <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                    {state.connectStatus === "pending_sent"
                        ? `Contact request sent to ${contactName}.`
                        : state.connectStatus === "pending_received"
                          ? `${contactName} sent you a contact request.`
                          : `You can message ${contactName}. Connect to add them as a contact.`}
                </span>
                {state.connectStatus === "pending_received" ? (
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            className="rounded-full"
                            disabled={isActing || isLoading}
                            onClick={() =>
                                void runContactAction(
                                    () => acceptConnectRequestAction(otherParticipant.did!),
                                    "Accept contact request",
                                )
                            }
                        >
                            Accept
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full"
                            disabled={isActing || isLoading}
                            onClick={() =>
                                void runContactAction(
                                    () => declineConnectRequestAction(otherParticipant.did!),
                                    "Decline contact request",
                                )
                            }
                        >
                            Decline
                        </Button>
                    </div>
                ) : (
                    <Button
                        size="sm"
                        variant={state.connectStatus === "pending_sent" ? "outline" : "default"}
                        className="rounded-full"
                        disabled={isActing || isLoading || state.connectStatus === "pending_sent"}
                        onClick={() =>
                            void runContactAction(() => sendConnectRequestAction(otherParticipant.did!), "Connect")
                        }
                    >
                        {state.connectStatus === "pending_sent" ? "Requested" : "Connect"}
                    </Button>
                )}
            </div>
        </div>
    );
};

// Renderer for different message types
export const MessageRenderer: React.FC<{ message: ChatMessage; preview?: boolean }> = ({ message, preview }) => {
    const displayName = message.author?.name || message.createdBy;
    switch (message.type) {
        case "m.room.message":
            if (!Object.keys(message.content).length) {
                return <span className="italic text-gray-500">Message deleted</span>;
            }

            // Check if message has been edited
            const isEdited = (message.content as any)["m.new_content"] !== undefined || !!(message as any)?.editedAt;
            const attachments = (message as any)?.attachments as
                | { url: string; name: string; mimeType?: string; size?: number }[]
                | undefined;

            return (
                <span>
                    {renderChatMessage(message, preview)}
                    {Array.isArray(attachments) && attachments.length > 0 && (
                        <div className="mt-2 space-y-2">
                            {attachments.map((attachment, index) => {
                                const isImage = attachment.mimeType?.startsWith("image/");
                                if (isImage) {
                                    return (
                                        <div key={`${attachment.url}-${index}`} className="max-w-xs sm:max-w-sm">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={attachment.url}
                                                alt={attachment.name || "Image attachment"}
                                                className="max-h-60 w-full cursor-pointer rounded-lg object-contain hover:opacity-90"
                                                onClick={() => window.open(attachment.url, "_blank")}
                                            />
                                        </div>
                                    );
                                }
                                return (
                                    <a
                                        key={`${attachment.url}-${index}`}
                                        href={attachment.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 rounded-lg bg-gray-100 p-3 transition-colors hover:bg-gray-200"
                                    >
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                                            <IoDocumentText className="h-6 w-6" />
                                        </div>
                                        <div className="flex flex-col overflow-hidden">
                                            <span className="truncate font-medium text-gray-700">
                                                {attachment.name}
                                            </span>
                                            {attachment.size && (
                                                <span className="text-xs text-gray-500">
                                                    {(attachment.size / 1024).toFixed(1)} KB
                                                </span>
                                            )}
                                        </div>
                                    </a>
                                );
                            })}
                        </div>
                    )}
                    {isEdited && <span className="ml-1 text-xs italic text-gray-500">(edited)</span>}
                </span>
            );

        case "m.room.member": {
            const membership = (message.content as { membership: string }).membership;
            const action = membership === "join" ? "has joined" : membership === "leave" ? "has left" : membership;
            return renderSystemMessage(`${displayName} ${action} the room.`);
        }

        case "m.room.notice": {
            const body = (message?.content?.body as string) || "";
            const isMarkdown = (message as any)?.format === "markdown";
            const shouldEmphasizeLinks = isNonPreviewSystemSenderMessage(message);
            if (isMarkdown) {
                return (
                    <MemoizedReactMarkdown
                        className={shouldEmphasizeLinks ? "formatted max-w-none text-sm leading-relaxed" : undefined}
                        components={{
                            a: ({ href, className, ...props }) => (
                                <a
                                    href={href}
                                    className={
                                        isChatMentionLinkHref(href)
                                            ? `inline font-semibold text-[hsl(var(--task-link))] no-underline hover:text-[hsl(var(--task-link-hover))] hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--task-link))] ${className ?? ""}`.trim()
                                            : `${shouldEmphasizeLinks ? "text-[hsl(var(--task-link))] underline underline-offset-2 hover:text-[hsl(var(--task-link-hover))]" : ""} ${className ?? ""}`.trim()
                                    }
                                    {...props}
                                />
                            ),
                        }}
                    >
                        {body}
                    </MemoizedReactMarkdown>
                );
            }
            return renderSystemMessage(renderMentionsAsDisplayText(body));
        }

        case "m.room.name":
        case "m.room.topic":
        case "m.room.history_visibility":
        case "m.room.join_rules":
        case "m.room.canonical_alias":
        case "m.room.power_levels":
        case "m.room.create":
            return null; // Hide these system messages

        default:
            return null; // Hide unknown events as well
    }
};

const renderSystemMessage = (content: string) => content;

type ChatMessagesProps = {
    messages: ChatMessage[];
    messagesEndRef?: React.RefObject<HTMLDivElement | null>;
    onMessagesRendered?: () => void;
    handleDelete: (message: ChatMessage) => Promise<void>;
    handleEdit: (message: ChatMessage) => void;
    canReply?: boolean;
    chatProvider?: "matrix" | "mongo";
    isDirect?: boolean;
    conversationId?: string;
    currentUser?: any;
    onTopicOpen?: () => void;
    onTopicLoaded?: () => void;
    topicNavigationRequest?: TopicNavigationRequest | null;
    openTopicIds?: Set<string>;
    onToggleTopic?: (topicId: string) => void;
    onCreateTopic?: () => void;
    onTopicActivity?: () => Promise<void> | void;
    bottomAction?: React.ReactNode;
    topicsLoaded?: boolean;
    mentionCandidates?: Circle[];
};

const sameAuthor = (message1: ChatMessage, message2: ChatMessage) => {
    if (!message1?.createdBy || !message2?.createdBy) return false;
    if (message1.type !== "m.room.message" || message2.type !== "m.room.message") return false;
    return message1.createdBy === message2.createdBy;
};

const formatLegacyMessageTime = (date: Date) =>
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

const formatLegacyDateLabel = (date: Date) => date.toDateString();

const LegacyReadOnlyMessageRow: React.FC<{
    message: ChatMessage;
    previousMessage?: ChatMessage | null;
    nextMessage?: ChatMessage | null;
    isDirect?: boolean;
    currentUserDid?: string;
}> = ({ message, previousMessage, nextMessage, isDirect = false, currentUserDid }) => {
    const createdAt = new Date(message.createdAt);
    const previousCreatedAt = previousMessage ? new Date(previousMessage.createdAt) : null;
    const nextCreatedAt = nextMessage ? new Date(nextMessage.createdAt) : null;
    const isSameDayAsPrevious =
        !!previousCreatedAt &&
        createdAt.getFullYear() === previousCreatedAt.getFullYear() &&
        createdAt.getMonth() === previousCreatedAt.getMonth() &&
        createdAt.getDate() === previousCreatedAt.getDate();
    const isSameDayAsNext =
        !!nextCreatedAt &&
        createdAt.getFullYear() === nextCreatedAt.getFullYear() &&
        createdAt.getMonth() === nextCreatedAt.getMonth() &&
        createdAt.getDate() === nextCreatedAt.getDate();
    const isOwnMessage = message.createdBy === currentUserDid;
    const isFirstInChain = !previousMessage || !sameAuthor(previousMessage, message) || !isSameDayAsPrevious;
    const isLastInChain = !nextMessage || !sameAuthor(nextMessage, message) || !isSameDayAsNext;
    const isNonPreviewSender = isNonPreviewSystemSenderMessage(message);
    const senderLabel = message.author?.name || message.createdBy;

    return (
        <>
            {!isSameDayAsPrevious && (
                <div className="my-2 text-center text-xs text-gray-500">
                    <span className="rounded-full bg-gray-200 px-2 py-1 shadow-sm">
                        {Number.isNaN(createdAt.getTime()) ? "Date unavailable" : formatLegacyDateLabel(createdAt)}
                    </span>
                </div>
            )}
            <div
                className={`mb-1 flex gap-2 ${isFirstInChain ? "mt-3" : "mt-1"} ${isOwnMessage ? "justify-end" : "justify-start"}`}
            >
                {!isDirect &&
                    !isOwnMessage &&
                    (isLastInChain ? (
                        <CirclePicture
                            circle={message.author!}
                            size="28px"
                            className="mb-1 flex-shrink-0 self-end"
                            openPreview={!isNonPreviewSender}
                        />
                    ) : (
                        <div className="w-7 flex-shrink-0" />
                    ))}
                <div className="relative flex min-w-[100px] max-w-[75%] flex-col">
                    <div
                        className={`${CHAT_STANDARD_BUBBLE_CLASS} p-2 pr-4 shadow-sm`}
                        style={{ borderRadius: "12px" }}
                    >
                        {isFirstInChain && !isOwnMessage && !isDirect && (
                            <div
                                className="text-xs font-semibold"
                                style={{ color: generateColorFromString(senderLabel || "") }}
                            >
                                {senderLabel}
                            </div>
                        )}
                        <MessageRenderer message={message} />
                        {isLastInChain && (
                            <div className="mt-0 flex items-center justify-end gap-1 text-[9px] text-gray-400">
                                <span>
                                    {Number.isNaN(createdAt.getTime()) ? "" : formatLegacyMessageTime(createdAt)}
                                </span>
                            </div>
                        )}
                    </div>
                    {message.reactions && Object.keys(message.reactions).length > 0 && (
                        <div
                            className={`relative z-10 -mt-3 flex flex-wrap gap-1 px-1 ${isOwnMessage ? "justify-end" : "justify-start"}`}
                        >
                            {Object.entries(message.reactions).map(([reaction, reactions]) => (
                                <div
                                    key={reaction}
                                    className="flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs"
                                >
                                    <span>{reaction}</span>
                                    {reactions.length > 1 && (
                                        <span className="ml-1 text-gray-600">{reactions.length}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {!isDirect &&
                    isOwnMessage &&
                    (isLastInChain ? (
                        <CirclePicture
                            circle={message.author!}
                            size="28px"
                            className="mb-1 flex-shrink-0 self-end"
                            openPreview={false}
                        />
                    ) : (
                        <div className="w-7 flex-shrink-0" />
                    ))}
            </div>
        </>
    );
};

const EarlierMessagesSection: React.FC<{
    conversationId?: string;
    isDirect?: boolean;
    currentUserDid?: string;
}> = ({ conversationId, isDirect = false, currentUserDid }) => {
    const [count, setCount] = useState<number | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[] | null>(null);
    const [isCountLoading, setIsCountLoading] = useState(false);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [countError, setCountError] = useState<string | null>(null);
    const [messagesError, setMessagesError] = useState<string | null>(null);

    const loadCount = useCallback(async () => {
        if (!conversationId) {
            setCount(0);
            return;
        }

        setIsCountLoading(true);
        setCountError(null);
        try {
            const { getLegacyLooseMessageCountAction } = await import("./mongo-actions");
            const result = await getLegacyLooseMessageCountAction(conversationId);
            if (!result.success) {
                setCountError(result.message || "Earlier messages could not be checked.");
                return;
            }
            setCount(result.count || 0);
        } catch (error) {
            console.error("Failed to load earlier message count:", error);
            setCountError("Earlier messages could not be checked.");
        } finally {
            setIsCountLoading(false);
        }
    }, [conversationId]);

    const loadMessages = useCallback(async () => {
        if (!conversationId || isLoadingMessages) return;
        setIsLoadingMessages(true);
        setMessagesError(null);
        try {
            const { fetchLegacyLooseMessagesAction } = await import("./mongo-actions");
            const result = await fetchLegacyLooseMessagesAction(conversationId);
            if (!result.success) {
                setMessagesError(result.message || "Earlier messages could not be loaded.");
                return;
            }
            setMessages(getLegacyLooseMessages(result.messages || []));
        } catch (error) {
            console.error("Failed to load earlier messages:", error);
            setMessagesError("Earlier messages could not be loaded.");
        } finally {
            setIsLoadingMessages(false);
        }
    }, [conversationId, isLoadingMessages]);

    useEffect(() => {
        setCount(null);
        setMessages(null);
        setIsExpanded(false);
        void loadCount();
    }, [loadCount]);

    const toggleExpanded = () => {
        const nextExpanded = !isExpanded;
        setIsExpanded(nextExpanded);
        if (
            shouldFetchLegacyLooseMessagesOnExpand({
                isExpanded: nextExpanded,
                hasLoadedMessages: messages !== null,
                isLoadingMessages,
            })
        ) {
            void loadMessages();
        }
    };

    if (isCountLoading && count === null && !countError) return null;
    if (!countError && !shouldShowLegacyLooseMessageSection(count)) return null;

    const messageCountLabel = count === 1 ? "1 earlier message" : `${count ?? 0} earlier messages`;

    return (
        <section className={`${CHAT_TOPIC_BACKGROUND_CLASS} overflow-hidden rounded-lg shadow-sm`}>
            <button
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={toggleExpanded}
                aria-expanded={isExpanded}
            >
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">Earlier messages</div>
                    <div className="text-xs text-gray-600">
                        Messages sent before topic-based discussions were introduced.
                    </div>
                    {countError ? (
                        <div className="mt-1 text-xs text-red-600">{countError}</div>
                    ) : (
                        <div className="mt-1 text-xs font-medium text-gray-700">{messageCountLabel}</div>
                    )}
                </div>
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/70 text-gray-700">
                    {isExpanded ? <IoChevronDown className="h-5 w-5" /> : <IoChevronForward className="h-5 w-5" />}
                </span>
            </button>
            {countError && (
                <div className="border-t border-[#DDEBB8] bg-white/60 px-4 py-3">
                    <Button size="sm" variant="outline" onClick={() => void loadCount()}>
                        Retry
                    </Button>
                </div>
            )}
            {isExpanded && !countError && (
                <div className="border-t border-[#DDEBB8] bg-white/50 px-3 py-3">
                    {isLoadingMessages && (
                        <div className="px-1 py-3 text-sm text-gray-500">Loading earlier messages...</div>
                    )}
                    {messagesError && (
                        <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                            <div>{messagesError}</div>
                            <Button size="sm" variant="outline" className="mt-2" onClick={() => void loadMessages()}>
                                Retry
                            </Button>
                        </div>
                    )}
                    {!isLoadingMessages && !messagesError && messages?.length === 0 && (
                        <div className="px-1 py-3 text-sm text-gray-500">No earlier messages found.</div>
                    )}
                    {!messagesError &&
                        messages?.map((message, index) => (
                            <LegacyReadOnlyMessageRow
                                key={message.id}
                                message={message}
                                previousMessage={index > 0 ? messages[index - 1] : null}
                                nextMessage={index < messages.length - 1 ? messages[index + 1] : null}
                                isDirect={isDirect}
                                currentUserDid={currentUserDid}
                            />
                        ))}
                </div>
            )}
        </section>
    );
};

const ChatMessages: React.FC<ChatMessagesProps> = ({
    messages,
    messagesEndRef,
    onMessagesRendered,
    handleDelete,
    handleEdit,
    canReply = true,
    isDirect = false,
    conversationId,
    currentUser,
    onTopicOpen,
    onTopicLoaded,
    topicNavigationRequest,
    openTopicIds,
    onToggleTopic,
    onCreateTopic,
    onTopicActivity,
    bottomAction,
    topicsLoaded = true,
    mentionCandidates = [],
}) => {
    const [user] = useAtom(userAtom);
    const [, setReplyToMessage] = useAtom(replyToMessageAtom);
    const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
    const [pickerOpenForMessage, setPickerOpenForMessage] = useState<string | null>(null);
    const [, setRoomMessages] = useAtom(roomMessagesAtom);
    const isMobile = useIsMobile();
    const handleReply = (message: ChatMessage) => {
        if (!canReply) return;
        setReplyToMessage(message);
    };

    const longPressTimer = useRef<NodeJS.Timeout | null>(null);

    const handleReaction = async (message: ChatMessage, emoji: string) => {
        if (!user) return;
        if (!user.did) return;

        const reactionSender = user.did;
        const anyExistingReaction = Object.entries(message.reactions || {})
            .map(([key, reactions]) => {
                const userReaction = reactions.find((r) => r.sender === reactionSender);
                return userReaction ? { ...userReaction, key } : null;
            })
            .find((r) => r !== null);

        // Optimistic UI Update
        setRoomMessages((prev) => {
            const newRooms = { ...prev };
            const roomMessages = [...(newRooms[message.roomId] || [])];
            const messageIndex = roomMessages.findIndex((m) => m.id === message.id);
            if (messageIndex === -1) return prev;

            const updatedMessage = { ...roomMessages[messageIndex] };
            const reactions = { ...(updatedMessage.reactions || {}) };

            // Remove any existing reaction from the user
            if (anyExistingReaction) {
                reactions[anyExistingReaction.key] = reactions[anyExistingReaction.key].filter(
                    (r) => r.sender !== reactionSender,
                );
                if (reactions[anyExistingReaction.key].length === 0) {
                    delete reactions[anyExistingReaction.key];
                }
            }

            // Add the new reaction, unless it was the same as the one removed
            if (!anyExistingReaction || anyExistingReaction.key !== emoji) {
                const newReaction: ReactionAggregation = {
                    sender: reactionSender,
                    eventId: `temp-id-${Date.now()}`,
                };
                reactions[emoji] = [...(reactions[emoji] || []), newReaction];
            }

            updatedMessage.reactions = reactions;
            roomMessages[messageIndex] = updatedMessage;
            newRooms[message.roomId] = roomMessages;
            return newRooms;
        });

        try {
            const result = await toggleMongoReactionAction(message.id, emoji);
            if (result.success && result.reactions) {
                setRoomMessages((prev) => {
                    const newRooms = { ...prev };
                    const roomMessages = [...(newRooms[message.roomId] || [])];
                    const messageIndex = roomMessages.findIndex((m) => m.id === message.id);
                    if (messageIndex === -1) return prev;
                    roomMessages[messageIndex] = { ...roomMessages[messageIndex], reactions: result.reactions };
                    newRooms[message.roomId] = roomMessages;
                    return newRooms;
                });
            }
        } catch (error) {
            console.error("Failed to update reaction:", error);
            // On failure, the state will be corrected by the next sync
        }
    };

    const handleTouchStart = (message: ChatMessage) => {
        if (isMobile) {
            longPressTimer.current = setTimeout(() => {
                setHoveredMessageId(message.id);
            }, 500); // 500ms for a long press
        }
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
        }
    };

    const toggleMobileMessageActions = (messageId: string) => {
        if (!isMobile) return;
        setHoveredMessageId((prev) => (prev === messageId ? null : messageId));
        setPickerOpenForMessage((prev) => (prev === messageId ? prev : null));
    };
    const isSameDay = (date1: Date, date2: Date) => {
        return (
            date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate()
        );
    };

    useEffect(() => {
        // Notify the parent once messages are rendered
        if (onMessagesRendered) {
            onMessagesRendered();
        }
    }, [messages, onMessagesRendered]);

    const formatChatDate = (chatDate: Date) => {
        return chatDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    };

    const topicMessages = getTopicIndexMessages(messages);
    const orderedMessages = topicMessages;

    const emptyTopicState =
        topicsLoaded && topicMessages.length === 0 ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F6DF] text-amber-600">
                    <HiLightBulb className="h-6 w-6" />
                </div>
                <h2 className="text-base font-semibold text-gray-900">Start the first topic</h2>
                <p className="mt-1 max-w-sm text-sm text-gray-500">
                    Conversations are organized by topic. Create one to open the discussion.
                </p>
                {canReply && (
                    <Button
                        className="mt-4 rounded-full bg-[hsl(var(--task-link))] text-white hover:bg-[hsl(var(--task-link-hover))]"
                        onClick={onCreateTopic}
                    >
                        Create the first topic
                    </Button>
                )}
            </div>
        ) : null;

    return (
        <div className="space-y-3">
            <EarlierMessagesSection
                conversationId={conversationId}
                isDirect={isDirect}
                currentUserDid={user?.did || currentUser?.did}
            />
            {emptyTopicState}
            {orderedMessages.reduce<React.ReactNode[]>((acc, message, index) => {
                if ((message as any).thread) {
                    acc.push(
                        <TopicCard
                            key={message.id}
                            message={message}
                            conversationId={conversationId || ""}
                            user={currentUser}
                            onTopicOpen={onTopicOpen}
                            onTopicLoaded={onTopicLoaded}
                            navigationRequest={topicNavigationRequest}
                            isSelected={openTopicIds?.has(message.id)}
                            onToggleTopic={onToggleTopic}
                            onTopicActivity={onTopicActivity}
                            mentionCandidates={mentionCandidates}
                        />,
                    );
                    return acc;
                }

                const isSystemMessage = message.type !== "m.room.message";
                const isNewDate =
                    index === 0 ||
                    !isSameDay(new Date(message.createdAt), new Date(orderedMessages[index - 1].createdAt));
                const isNewAuthor = index === 0 || !sameAuthor(orderedMessages[index - 1], message);
                const isFirstInChain = isNewDate || isNewAuthor;
                const isLastInChain =
                    index === orderedMessages.length - 1 ||
                    !sameAuthor(orderedMessages[index + 1], message) ||
                    !isSameDay(new Date(orderedMessages[index + 1].createdAt), new Date(message.createdAt));

                if (isNewDate) {
                    acc.push(
                        <div key={`date-${message.createdAt}`} className="my-2 mt-4 text-center text-sm text-gray-500">
                            <span className="rounded-full bg-gray-200 px-2 py-1 shadow-md">
                                {new Date(message.createdAt).toDateString()}
                            </span>
                        </div>,
                    );
                }
                const selfIdentifier = user?.did;
                const isOwnMessage = message.createdBy === selfIdentifier;
                const borderRadiusClass = "";
                const bubbleRadius = "12px";
                const canEditMessage = isOwnMessage && !message.status;
                const canDeleteMessage = isOwnMessage && message.status !== "pending";
                const bubbleStatusClasses =
                    message.status === "pending"
                        ? "opacity-70"
                        : message.status === "failed"
                          ? "border border-red-200"
                          : "";
                const isNonPreviewSender = isNonPreviewSystemSenderMessage(message);
                const senderLabel = message.author.name;

                if (isSystemMessage) {
                    acc.push(
                        <div key={message.id} className="my-2 mt-4 text-center text-sm text-gray-500">
                            <span className="rounded-full bg-gray-200 px-2 py-1 shadow-md">
                                <MessageRenderer message={message} />
                            </span>
                        </div>,
                    );
                } else {
                    acc.push(
                        <div
                            key={message.id}
                            id={getMessageElementId(message.id)}
                            data-message-id={message.id}
                            className={`group relative mb-1 flex gap-2 ${isFirstInChain ? "mt-4" : "mt-1"} ${hoveredMessageId === message.id ? "z-10" : ""} ${isOwnMessage ? "justify-end" : "justify-start"}`}
                            onMouseEnter={() => !isMobile && setHoveredMessageId(message.id)}
                            onMouseLeave={() => !isMobile && setHoveredMessageId(null)}
                            onTouchStart={() => handleTouchStart(message)}
                            onTouchEnd={handleTouchEnd}
                        >
                            {!isDirect &&
                                !isOwnMessage &&
                                (isLastInChain ? (
                                    <CirclePicture
                                        circle={message.author!}
                                        size="28px"
                                        className="mb-1 flex-shrink-0 self-end"
                                        openPreview={!isNonPreviewSender}
                                    />
                                ) : (
                                    <div className="w-7 flex-shrink-0" />
                                ))}

                            {!(message as any).thread && (
                                <div className="relative flex min-w-[100px] max-w-[75%] flex-col">
                                    <div
                                        className={`${CHAT_STANDARD_BUBBLE_CLASS} p-2 pr-4 shadow-md ${bubbleStatusClasses}`}
                                        style={{ borderRadius: bubbleRadius }}
                                        onClick={() => toggleMobileMessageActions(message.id)}
                                    >
                                        {isFirstInChain && !isOwnMessage && !isDirect && (
                                            <div
                                                className="text-xs font-semibold"
                                                style={{ color: generateColorFromString(senderLabel || "") }}
                                            >
                                                {senderLabel}
                                            </div>
                                        )}
                                        <MessageRenderer message={message} />
                                        {isLastInChain && (
                                            <div className="mt-0 flex items-center justify-end gap-1 text-[9px] text-gray-400">
                                                <span>{formatChatDate(new Date(message.createdAt))}</span>
                                                {isOwnMessage && message.status === "pending" && (
                                                    <span className="flex items-center gap-1 text-blue-400">
                                                        <IoTimeOutline className="h-2.5 w-2.5" />
                                                    </span>
                                                )}
                                                {isOwnMessage && message.status === "failed" && (
                                                    <span className="flex items-center gap-1 text-red-400">
                                                        <IoWarningOutline className="h-2.5 w-2.5" />
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {message.reactions && Object.keys(message.reactions).length > 0 && (
                                        <div
                                            className={`relative z-10 -mt-3 flex flex-wrap gap-1 px-1 ${isOwnMessage ? "justify-end" : "justify-start"}`}
                                        >
                                            {Object.entries(message.reactions).map(([reaction, reactions]) => (
                                                <div
                                                    key={reaction}
                                                    className={`flex items-center rounded-full border bg-gray-100 px-2 py-0.5 text-xs ${
                                                        reactions.some((r) => r.sender === user?.did)
                                                            ? "border-gray-200"
                                                            : "border-gray-200"
                                                    }`}
                                                    onClick={() => handleReaction(message, reaction)}
                                                >
                                                    <span>{reaction}</span>
                                                    {reactions.length > 1 && (
                                                        <span className="ml-1 text-gray-600">{reactions.length}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {(hoveredMessageId === message.id || pickerOpenForMessage === message.id) && (
                                        <div
                                            className={`absolute bottom-1 z-10 flex items-center gap-0.5 rounded-full border border-gray-200 bg-white p-0.5 shadow-sm ${isOwnMessage ? "left-0" : "right-0"}`}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {isOwnMessage && (
                                                <>
                                                    {canEditMessage && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={() => handleEdit(message)}
                                                        >
                                                            <GrEdit className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    {canDeleteMessage && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={() => handleDelete(message)}
                                                        >
                                                            <GrTrash className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </>
                                            )}
                                            {canReply && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6"
                                                    onClick={() => handleReply(message)}
                                                >
                                                    <MdReply className="h-4 w-4" />
                                                </Button>
                                            )}
                                            <Popover
                                                open={pickerOpenForMessage === message.id}
                                                onOpenChange={(isOpen) =>
                                                    setPickerOpenForMessage(isOpen ? message.id : null)
                                                }
                                            >
                                                <PopoverTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6">
                                                        <BsEmojiSmile className="h-4 w-4" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto border-none bg-transparent p-0">
                                                    <LazyEmojiPicker
                                                        onEmojiClick={(emojiData: EmojiClickData) => {
                                                            handleReaction(message, emojiData.emoji);
                                                            setPickerOpenForMessage(null);
                                                        }}
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                    )}
                                </div>
                            )}

                            {!isDirect &&
                                isOwnMessage &&
                                (isLastInChain ? (
                                    <CirclePicture
                                        circle={message.author!}
                                        size="28px"
                                        className="mb-1 flex-shrink-0 self-end"
                                        openPreview={false}
                                    />
                                ) : (
                                    <div className="w-7 flex-shrink-0" />
                                ))}
                        </div>,
                    );
                }

                return acc;
            }, [])}
            {bottomAction}
            <div ref={messagesEndRef} style={{ overflowAnchor: "none" }} />
        </div>
    );
};

interface LatestMessageProps {
    roomId: string;
    latestMessages: Record<string, any>;
}

export const LatestMessage: React.FC<LatestMessageProps> = ({ roomId, latestMessages }) => {
    const latestMessage = useMemo(() => {
        const matchingEntry = Object.entries(latestMessages).find(([key]) => key.startsWith(roomId));
        if (!matchingEntry) {
            return null;
        }
        // console.log(JSON.stringify(matchingEntry[1], null, 2));
        return matchingEntry[1];
    }, [latestMessages, roomId]);

    if (!latestMessage) {
        return <span>No messages yet</span>;
    }

    return <span>{latestMessage?.content?.body as string}</span>;

    // <MessageRenderer message={formattedMessage} preview={true} />;
};

type ChatInputProps = {
    roomId: string | null;
    editingMessage: ChatMessage | null;
    setEditingMessage: (message: ChatMessage | null) => void;
    mentionCandidates: Circle[];
    chatProvider?: "matrix" | "mongo";
    onMessageSent?: () => void;
    onMobileComposerExpandedChange?: (expanded: boolean) => void;
};

const ChatInput = ({
    roomId,
    editingMessage,
    setEditingMessage,
    mentionCandidates,
    onMessageSent,
    onMobileComposerExpandedChange,
}: ChatInputProps) => {
    const [user] = useAtom(userAtom);
    const [newMessage, setNewMessage] = useState("");
    const [replyToMessage, setReplyToMessage] = useAtom(replyToMessageAtom);
    const [, setRoomMessages] = useAtom(roomMessagesAtom);
    const isMobile = useIsMobile();
    const [isComposerFocused, setIsComposerFocused] = useState(false);
    const [isMobileActionMenuOpen, setIsMobileActionMenuOpen] = useState(false);
    const isExpandedMobileComposer = !!isMobile && (isComposerFocused || isMobileActionMenuOpen);

    const chatMentionsInputStyle = useMemo(() => {
        if (!isMobile) {
            return defaultMentionsInputStyle;
        }

        const mobilePadding = "0.75rem 0.875rem";
        const mobileHeight = {
            minHeight: "44px",
            maxHeight: isExpandedMobileComposer ? "160px" : "120px",
        };

        return {
            ...defaultMentionsInputStyle,
            control: {
                ...defaultMentionsInputStyle.control,
                ...mobileHeight,
            },
            input: {
                ...defaultMentionsInputStyle.input,
                ...mobileHeight,
                padding: mobilePadding,
                lineHeight: 1.45,
                overflowY: "auto" as const,
            },
            highlighter: {
                ...defaultMentionsInputStyle.highlighter,
                ...mobileHeight,
                padding: mobilePadding,
                lineHeight: 1.45,
            },
        };
    }, [isExpandedMobileComposer, isMobile]);

    const mentionSuggestions = useMemo(() => getChatMentionSuggestions(mentionCandidates), [mentionCandidates]);

    const handleChatMentionQuery = useCallback(
        (query: string, callback: (data: MentionSuggestion[]) => void) => {
            queryChatMentionSuggestions(mentionSuggestions, query, callback);
        },
        [mentionSuggestions],
    );
    // Populate input when editing
    useEffect(() => {
        if (editingMessage) {
            setNewMessage(editingMessage.content.body as string);
        }
    }, [editingMessage]);

    useEffect(() => {
        onMobileComposerExpandedChange?.(isExpandedMobileComposer);
    }, [isExpandedMobileComposer, onMobileComposerExpandedChange]);

    const handleSendMessage = async () => {
        const trimmedMessage = newMessage.trim();
        console.log("📤 [Send] handleSendMessage called", {
            hasUser: !!user,
            hasDid: !!user?.did,
            hasRoomId: !!roomId,
            roomId,
            provider: "mongo",
            messageLength: trimmedMessage.length,
            isEditing: !!editingMessage,
            editingMessageId: editingMessage?.id,
        });

        if (!user) return;

        if (!roomId) {
            console.error("Chat room does not have a room ID");
            return;
        }

        if (!trimmedMessage) {
            return;
        }

        // If editing, handle edit instead of send
        if (editingMessage) {
            console.log("📤 [Send] Routing to handleEditSubmit...");
            await handleEditSubmit();
            return;
        }

        const replyTarget = replyToMessage;
        const tempId =
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? `temp-${crypto.randomUUID()}`
                : `temp-${Date.now()}`;
        const optimisticMessage: ChatMessage = {
            id: tempId,
            roomId,
            type: "m.room.message",
            content: {
                msgtype: "m.text",
                body: trimmedMessage,
            },
            createdBy: user.did || user.handle || user.name || "You",
            createdAt: new Date(),
            author: user,
            reactions: {},
            replyTo: replyTarget
                ? {
                      id: replyTarget.id,
                      author: replyTarget.author,
                      content: replyTarget.content,
                  }
                : undefined,
            status: "pending",
        };

        const applyToTempMessage = (transform: (message: ChatMessage) => ChatMessage | null) => {
            setRoomMessages((prev) => {
                const current = prev[roomId] || [];
                const next = current.flatMap((msg) => {
                    if (msg.id !== tempId) {
                        return [msg];
                    }
                    const updated = transform(msg);
                    return updated ? [updated] : [];
                });

                return {
                    ...prev,
                    [roomId]: next,
                };
            });
        };

        setRoomMessages((prev) => {
            const current = prev[roomId] || [];
            const withoutRetriedFailures = current.filter((msg) => {
                if (msg.status !== "failed") return true;
                const body = typeof (msg.content as any)?.body === "string" ? (msg.content as any).body : "";
                return !(body === trimmedMessage && msg.createdBy === optimisticMessage.createdBy);
            });
            return {
                ...prev,
                [roomId]: [...withoutRetriedFailures, optimisticMessage],
            };
        });

        setNewMessage("");
        setReplyToMessage(null);
        onMessageSent?.();

        const rollbackOptimisticMessage = (reason?: string) => {
            console.error("Failed to send message:", reason);
            applyToTempMessage((msg) => ({
                ...msg,
                status: "failed",
                errorMessage: reason || "Failed to send",
            }));
            setNewMessage(trimmedMessage);
            if (replyTarget) {
                setReplyToMessage(replyTarget);
            }
        };

        console.log("📤 [Send] Sending new message...");
        try {
            const result = await sendMessageAction(roomId, trimmedMessage, replyTarget?.id);

            if (result.success) {
                dispatchNotificationRefresh({ reason: "chat-sent", roomId });
                const eventId = (result as any).eventId || (result as any).messageId;

                if (!eventId) {
                    applyToTempMessage((msg) => ({ ...msg, status: undefined }));
                } else {
                    setRoomMessages((prev) => {
                        const current = prev[roomId] || [];
                        const alreadyExists = current.some((msg) => msg.id === eventId);
                        const nextMessages = alreadyExists
                            ? current.filter((msg) => msg.id !== tempId)
                            : current.map((msg) =>
                                  msg.id === tempId ? { ...msg, id: eventId, status: undefined } : msg,
                              );

                        return {
                            ...prev,
                            [roomId]: nextMessages,
                        };
                    });
                }
            } else {
                rollbackOptimisticMessage(result.message);
            }
        } catch (error) {
            rollbackOptimisticMessage(error instanceof Error ? error.message : String(error));
        }
    };

    const handleEditSubmit = async () => {
        console.log("✏️ [Edit] Starting edit submission", {
            hasEditingMessage: !!editingMessage,
            messageId: editingMessage?.id,
            newContent: newMessage.trim(),
            roomId,
        });

        if (!editingMessage || !newMessage.trim()) {
            console.log("✏️ [Edit] Aborted - missing message or content");
            return;
        }
        const trimmedContent = newMessage.trim();

        try {
            console.log("✏️ [Edit] Importing editMessageAction...");
            console.log("✏️ [Edit] Calling editMessageAction with:", {
                roomId,
                eventId: editingMessage.id,
                content: trimmedContent,
            });

            const result = await editMessageAction(roomId!, editingMessage.id, trimmedContent);

            console.log("✏️ [Edit] Server response:", result);

            if (result.success) {
                const roomKey = editingMessage.roomId || roomId;
                const editedAt = new Date();
                if (roomKey) {
                    setRoomMessages((prev) => {
                        const current = prev[roomKey] || [];
                        const next = current.map((msg) => {
                            if (msg.id !== editingMessage.id) return msg;
                            const updated = {
                                ...msg,
                                content: {
                                    ...(msg.content as Record<string, unknown>),
                                    body: trimmedContent,
                                } as ChatMessage["content"],
                            } as ChatMessage;
                            (updated as any).editedAt = editedAt;
                            return updated;
                        });
                        return {
                            ...prev,
                            [roomKey]: next,
                        };
                    });
                }
                console.log("✏️ [Edit] Success! Clearing state...");
                setNewMessage("");
                setEditingMessage(null);
            } else {
                console.error("✏️ [Edit] Failed:", result.message);
                alert(`Failed to edit message: ${result.message}`);
            }
        } catch (error) {
            console.error("✏️ [Edit] Exception:", error);
            alert("Failed to edit message. Please try again.");
        }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset input so the same file can be selected again
        e.target.value = "";

        if (!user) return;

        // Check size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert("File size exceeds 5MB limit.");
            return;
        }

        setIsUploading(true);
        try {
            const formData = new FormData();
            if (!roomId) {
                console.error("Chat room does not have a room ID");
                return;
            }
            formData.append("roomId", roomId);
            formData.append("file", file);

            if (replyToMessage) {
                formData.append("replyToEventId", replyToMessage.id);
            }

            const result = await sendAttachmentAction(formData);

            if (result.success) {
                dispatchNotificationRefresh({ reason: "chat-sent", roomId });
                setReplyToMessage(null);
                onMessageSent?.();
            } else {
                console.error("Failed to send attachment:", result.message);
                alert(`Failed to send attachment: ${result.message}`);
            }
        } catch (error) {
            console.error("Failed to send attachment:", error);
            alert("An error occurred while uploading the file.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleCommentKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === "Escape" && editingMessage) {
            setEditingMessage(null);
            setNewMessage("");
        }
    };

    return (
        <div className="flex w-full flex-col">
            <div className={`flex w-full items-end gap-2 ${isMobile ? "gap-1.5" : ""}`}>
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                <Button
                    variant="ghost"
                    size="icon"
                    className={`shrink-0 rounded-full text-gray-500 hover:bg-gray-200 ${isExpandedMobileComposer ? "hidden" : "inline-flex"} ${isMobile ? "h-9 w-9" : "h-10 w-10"}`}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                >
                    {isUploading ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                    ) : (
                        <IoAttach className="h-6 w-6" />
                    )}
                </Button>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`shrink-0 rounded-full text-gray-500 hover:bg-gray-200 ${isExpandedMobileComposer ? "hidden" : "inline-flex"} ${isMobile ? "h-9 w-9" : "h-10 w-10"}`}
                        >
                            <BsEmojiSmile className="h-5 w-5" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto border-none bg-transparent p-0">
                        <LazyEmojiPicker
                            onEmojiClick={(data: EmojiClickData) => setNewMessage((prev) => prev + data.emoji)}
                        />
                    </PopoverContent>
                </Popover>

                <div className="min-w-0 flex-1">
                    {editingMessage && (
                        <div className="mb-2 rounded-lg bg-blue-100 p-2">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-grow overflow-hidden">
                                    <div className="font-semibold text-blue-700">Editing message</div>
                                    <p className="line-clamp-2 text-sm text-blue-600">
                                        {editingMessage.content.body as string}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 rounded-full px-3 text-gray-600 hover:bg-gray-200 hover:text-gray-800"
                                        onClick={() => {
                                            setEditingMessage(null);
                                            setNewMessage("");
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="h-8 rounded-full px-3"
                                        onClick={handleSendMessage}
                                        disabled={!newMessage.trim()}
                                    >
                                        Save
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                    {replyToMessage && !editingMessage && (
                        <div className="mb-2 flex max-w-full items-center justify-between overflow-hidden rounded-lg bg-gray-200 p-2">
                            <div className="flex-grow overflow-hidden">
                                <div className="font-semibold text-gray-700">
                                    Replying to {replyToMessage.author.name}
                                </div>
                                <p className="line-clamp-3 text-sm text-gray-600">
                                    {replyToMessage.content.body as string}
                                </p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setReplyToMessage(null)}>
                                <IoClose className="h-5 w-5" />
                            </Button>
                        </div>
                    )}
                    <MentionsInput
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={handleCommentKeyDown}
                        onFocus={() => setIsComposerFocused(true)}
                        onBlur={() => setIsComposerFocused(false)}
                        placeholder="Type a message. Use return for a new line."
                        className="min-w-0 rounded-[20px] bg-gray-100 text-base"
                        style={chatMentionsInputStyle}
                        allowSuggestionsAboveCursor={true}
                        forceSuggestionsAboveCursor={true}
                    >
                        <Mention
                            trigger="@"
                            data={handleChatMentionQuery}
                            style={defaultMentionStyle}
                            displayTransform={(id, display) => `${display}`}
                            renderSuggestion={renderCircleSuggestion}
                            markup="[__display__](/circles/__id__)"
                        />
                    </MentionsInput>
                </div>

                {isMobile && isExpandedMobileComposer && (
                    <Popover open={isMobileActionMenuOpen} onOpenChange={setIsMobileActionMenuOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10 shrink-0 rounded-full text-gray-500 hover:bg-gray-200"
                                title="More actions"
                                aria-label="More actions"
                            >
                                <IoAddCircleOutline className="h-6 w-6" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" side="top" className="w-[280px] rounded-2xl p-3">
                            <div className="mb-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full justify-start rounded-full"
                                    onClick={() => {
                                        setIsMobileActionMenuOpen(false);
                                        fileInputRef.current?.click();
                                    }}
                                    disabled={isUploading}
                                >
                                    <IoAttach className="mr-2 h-4 w-4" />
                                    Attach file
                                </Button>
                            </div>
                            <LazyEmojiPicker
                                onEmojiClick={(data: EmojiClickData) => {
                                    setNewMessage((prev) => prev + data.emoji);
                                }}
                            />
                        </PopoverContent>
                    </Popover>
                )}

                <Button
                    variant="ghost"
                    size="icon"
                    className="hidden h-10 w-10 shrink-0 rounded-full text-[hsl(var(--task-link))] hover:bg-[hsl(var(--founding-member-bg))] md:inline-flex"
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim()}
                    title={editingMessage ? "Save edit" : "Send message"}
                    aria-label={editingMessage ? "Save edit" : "Send message"}
                >
                    <IoSend className="h-5 w-5" />
                </Button>
                {isMobile && (
                    <Button
                        onClick={handleSendMessage}
                        className="ml-1 shrink-0 rounded-full text-white"
                        aria-label={editingMessage ? "Save edit" : "Send message"}
                    >
                        {editingMessage ? "Save" : <IoSend />}
                    </Button>
                )}
            </div>
        </div>
    );
};

// ─── Topic inline card (self-contained, expands in place) ──────────────────

const getTopicStorageKey = (conversationId: string) => `kamooni_open_topics_${conversationId}`;
const getTopicLastSeenKey = (conversationId: string, topicId: string) =>
    `kamooni_topic_lastseen_${conversationId}_${topicId}`;
const OPEN_TOPIC_EVENT = "kamooni:open-topic";

type TopicNavigationRequest = {
    topicId: string;
    nonce: number;
};

const getOpenTopicIds = (conversationId: string): Set<string> => {
    try {
        const raw = localStorage.getItem(getTopicStorageKey(conversationId));
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
};

const setOpenTopicIds = (conversationId: string, ids: Set<string>) => {
    try {
        localStorage.setItem(getTopicStorageKey(conversationId), JSON.stringify(Array.from(ids)));
    } catch {
        // localStorage unavailable — fail silently
    }
};

const getTopicLastSeen = (conversationId: string, topicId: string): number => {
    try {
        const raw = localStorage.getItem(getTopicLastSeenKey(conversationId, topicId));
        return raw ? parseInt(raw, 10) : 0;
    } catch {
        return 0;
    }
};

const setTopicLastSeen = (conversationId: string, topicId: string, timestamp: number) => {
    try {
        localStorage.setItem(getTopicLastSeenKey(conversationId, topicId), String(timestamp));
    } catch {
        // localStorage unavailable — fail silently
    }
};

const TopicCard: React.FC<{
    message: any;
    conversationId: string;
    user: any;
    onTopicOpen?: () => void;
    onTopicLoaded?: () => void;
    navigationRequest?: TopicNavigationRequest | null;
    isSelected?: boolean;
    onToggleTopic?: (topicId: string) => void;
    onTopicActivity?: () => Promise<void> | void;
    mentionCandidates?: Circle[];
}> = ({
    message,
    conversationId,
    user,
    onTopicOpen,
    onTopicLoaded,
    navigationRequest,
    isSelected,
    onToggleTopic,
    onTopicActivity,
    mentionCandidates = [],
}) => {
    const thread = message.thread;
    const messageId = message.id || message._id;
    const cardRef = useRef<HTMLDivElement>(null);

    const [isOpen, setIsOpen] = useState<boolean>(() => {
        if (isSelected) return true;
        const openIds = getOpenTopicIds(conversationId);
        return openIds.has(messageId);
    });

    const [replies, setReplies] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [replyText, setReplyText] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [unreadCount, setUnreadCount] = useState<number>(0);
    const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
    const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
    const [editingReplyText, setEditingReplyText] = useState("");
    const [hoveredReplyId, setHoveredReplyId] = useState<string | null>(null);
    const [isEditingStarter, setIsEditingStarter] = useState(false);
    const [editingStarterText, setEditingStarterText] = useState("");
    const [editedStarterBody, setEditedStarterBody] = useState<string | null>(null);
    const [isHoveringStarter, setIsHoveringStarter] = useState(false);
    const [pickerOpenForReply, setPickerOpenForReply] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
    const replyTextRef = useRef("");
    const pendingScrollIntoViewRef = useRef(false);
    const isMobile = useIsMobile();
    const isTopicOpen = isSelected === undefined ? isOpen : isSelected === true;
    const mentionSuggestions = useMemo(() => getChatMentionSuggestions(mentionCandidates), [mentionCandidates]);
    const topicReplyMentionsInputStyle = useMemo(() => {
        const minHeight = isMobile ? "96px" : "44px";
        const maxHeight = isMobile ? "260px" : "224px";
        const padding = "0.5rem 0.75rem";

        return {
            ...defaultMentionsInputStyle,
            control: {
                ...defaultMentionsInputStyle.control,
                minHeight,
                maxHeight,
                backgroundColor: "rgb(249 250 251)",
                border: "1px solid rgb(229 231 235)",
                borderRadius: "1rem",
                overflowY: "auto" as const,
            },
            input: {
                ...defaultMentionsInputStyle.input,
                minHeight,
                maxHeight,
                padding,
                fontSize: "1rem",
                lineHeight: 1.625,
                overflowY: "auto" as const,
                border: "none",
            },
            highlighter: {
                ...defaultMentionsInputStyle.highlighter,
                minHeight,
                maxHeight,
                padding,
                fontSize: "1rem",
                lineHeight: 1.625,
            },
            suggestions: {
                ...defaultMentionsInputStyle.suggestions,
                list: {
                    ...defaultMentionsInputStyle.suggestions.list,
                    maxHeight: isMobile ? "180px" : defaultMentionsInputStyle.suggestions.list.maxHeight,
                },
            },
        };
    }, [isMobile]);
    const handleTopicMentionQuery = useCallback(
        (query: string, callback: (data: MentionSuggestion[]) => void) => {
            queryChatMentionSuggestions(mentionSuggestions, query, callback);
        },
        [mentionSuggestions],
    );
    const setTopicReplyText = useCallback((value: string | ((currentValue: string) => string)) => {
        const nextValue = typeof value === "function" ? value(replyTextRef.current) : value;
        replyTextRef.current = nextValue;
        setReplyText(nextValue);
    }, []);

    const autoGrowReplyTextarea = useCallback(() => {
        const textarea = replyTextareaRef.current;
        if (!textarea) return;
        textarea.style.height = "0px";
        textarea.style.height = `${Math.min(textarea.scrollHeight, isMobile ? 260 : 224)}px`;
    }, [isMobile]);

    // Load replies on mount if topic starts open
    useEffect(() => {
        if (isTopicOpen) {
            void loadReplies();
            onTopicOpen?.();
        } else {
            void computeUnreadCount();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!isTopicOpen) return;
        setIsOpen(true);
        void loadReplies();
        onTopicOpen?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTopicOpen, messageId]);

    // Re-check unread count whenever replyCount changes (picks up new replies without refresh)
    useEffect(() => {
        if (!isTopicOpen) {
            void computeUnreadCount();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [thread?.replyCount, isTopicOpen]);

    useEffect(() => {
        autoGrowReplyTextarea();
    }, [autoGrowReplyTextarea, replyText]);

    useEffect(() => {
        if (!replyToMessage?.id) return;
        const textarea = replyTextareaRef.current;
        if (!textarea) return;

        try {
            textarea.focus({ preventScroll: true });
        } catch {
            textarea.focus();
        }

        const caretPosition = textarea.value.length;
        textarea.setSelectionRange(caretPosition, caretPosition);
    }, [replyToMessage?.id]);

    const computeUnreadCount = async () => {
        try {
            const { fetchThreadRepliesAction } = await import("./mongo-actions");
            const result = await fetchThreadRepliesAction(messageId, conversationId);
            if (result.success && result.replies) {
                const lastSeen = getTopicLastSeen(conversationId, messageId);
                const unseen = result.replies.filter((r: any) => {
                    const ts = new Date(r.createdAt).getTime();
                    return ts > lastSeen;
                }).length;
                setUnreadCount(unseen);
            }
        } catch {
            // fail silently
        }
    };

    const loadReplies = async () => {
        setIsLoading(true);
        try {
            const { fetchThreadRepliesAction } = await import("./mongo-actions");
            const result = await fetchThreadRepliesAction(messageId, conversationId);
            if (result.success && result.replies) {
                const mapped = result.replies.map((r: any) => {
                    // Convert raw reactions array [{emoji, userDid}] to keyed map {emoji: [{sender, eventId}]}
                    const rawReactions = Array.isArray(r.reactions) ? r.reactions : [];
                    const reactionMap = rawReactions.reduce((acc: Record<string, any[]>, reaction: any) => {
                        const key = reaction.emoji;
                        if (!key) return acc;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push({
                            sender: reaction.userDid,
                            eventId: `${r._id}:${reaction.userDid}:${key}`,
                        });
                        return acc;
                    }, {});

                    return {
                        id: r._id?.toString(),
                        roomId: conversationId,
                        type: "m.room.message",
                        content: { msgtype: "m.text", body: r.body },
                        attachments: r.attachments,
                        reactions: reactionMap,
                        createdAt: r.createdAt,
                        createdBy: r.senderDid,
                        author: {
                            _id: r.senderDid,
                            name:
                                r.authorName && !r.authorName.includes(":") && r.authorName.length < 40
                                    ? r.authorName
                                    : r.senderDid,
                            picture: r.authorPicture ? { url: r.authorPicture } : { url: "/placeholder.svg" },
                        } as Circle,
                        replyTo: r.replyTo,
                    };
                });
                setReplies(mapped);
                // Mark all as seen
                const now = Date.now();
                setTopicLastSeen(conversationId, messageId, now);
                setUnreadCount(0);
            }
        } catch (e) {
            console.error("Failed to load topic replies:", e);
        } finally {
            setIsLoading(false);
            if (pendingScrollIntoViewRef.current) {
                pendingScrollIntoViewRef.current = false;
                requestAnimationFrame(() => {
                    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                });
            }
            onTopicLoaded?.();
        }
    };

    useEffect(() => {
        if (navigationRequest?.topicId !== messageId) {
            return;
        }

        pendingScrollIntoViewRef.current = true;

        if (!isOpen) {
            setIsOpen(true);
            const openIds = getOpenTopicIds(conversationId);
            openIds.add(messageId);
            setOpenTopicIds(conversationId, openIds);
            setTopicLastSeen(conversationId, messageId, Date.now());
            setUnreadCount(0);
            void loadReplies();
            onTopicOpen?.();
            return;
        }

        if (replies.length === 0 && !isLoading) {
            void loadReplies();
            return;
        }

        requestAnimationFrame(() => {
            cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigationRequest?.nonce]);

    if (!thread) return null;

    const handleToggle = () => {
        if (onToggleTopic) {
            onToggleTopic(messageId);
            return;
        }
        const next = !isOpen;
        if (next) {
            void loadReplies();
            onTopicOpen?.();
        }
        setIsOpen(next);
        const openIds = getOpenTopicIds(conversationId);
        if (next) {
            openIds.add(messageId);
            // Mark as seen when opening
            setTopicLastSeen(conversationId, messageId, Date.now());
            setUnreadCount(0);
        } else {
            openIds.delete(messageId);
        }
        setOpenTopicIds(conversationId, openIds);
    };

    const handleSendReply = async () => {
        const trimmed = replyTextRef.current.trim();
        if (!trimmed || isSending) return;
        setIsSending(true);
        try {
            const { sendThreadReplyAction } = await import("./mongo-actions");
            const result = await sendThreadReplyAction(messageId, conversationId, trimmed, replyToMessage?.id);
            if (result.success) {
                dispatchNotificationRefresh({ reason: "chat-sent", roomId: conversationId });
                setTopicReplyText("");
                setReplyToMessage(null);
                await onTopicActivity?.();
                await loadReplies();
                requestAnimationFrame(() => {
                    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                });
            }
        } catch (e) {
            console.error("Failed to send topic reply:", e);
        } finally {
            setIsSending(false);
        }
    };

    const handleEditSubmit = async (replyId: string) => {
        const trimmed = editingReplyText.trim();
        if (!trimmed) return;
        try {
            const { editMessageAction } = await import("./actions");
            const result = await editMessageAction(conversationId, replyId, trimmed);
            if (result.success) {
                setEditingReplyId(null);
                setEditingReplyText("");
                await loadReplies();
            }
        } catch (e) {
            console.error("Failed to edit topic reply:", e);
        }
    };

    const handleStarterEditSubmit = async () => {
        const trimmed = editingStarterText.trim();
        if (!trimmed) return;
        try {
            const { editMessageAction } = await import("./actions");
            const result = await editMessageAction(conversationId, messageId, trimmed);
            if (result.success) {
                setEditedStarterBody(trimmed);
                setIsEditingStarter(false);
                setEditingStarterText("");
            }
        } catch (e) {
            console.error("Failed to edit topic starter:", e);
        }
    };

    const handleReaction = async (replyId: string, emoji: string) => {
        try {
            const { toggleMongoReactionAction } = await import("./actions");
            await toggleMongoReactionAction(replyId, emoji);
            await loadReplies();
        } catch (e) {
            console.error("Failed to toggle reaction:", e);
        }
    };

    const handleDeleteReply = async (replyId: string) => {
        if (!window.confirm("Are you sure you want to delete this reply?")) {
            return;
        }

        try {
            const result = await deleteMongoMessageAction(replyId);
            if (result.success) {
                if (replyToMessage?.id === replyId) {
                    setReplyToMessage(null);
                }
                await loadReplies();
                return;
            }

            alert(`Failed to delete reply: ${result.message}`);
        } catch (e) {
            console.error("Failed to delete topic reply:", e);
            alert("Failed to delete reply. Please try again.");
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";
        if (file.size > 5 * 1024 * 1024) {
            alert("File size exceeds 5MB limit.");
            return;
        }
        setIsUploading(true);
        try {
            const { sendAttachmentAction } = await import("./actions");
            const formData = new FormData();
            formData.append("roomId", conversationId);
            formData.append("file", file);
            // Pass threadId so the attachment reply is linked to this topic
            formData.append("threadId", messageId);
            if (replyToMessage?.id) {
                formData.append("replyToMessageId", replyToMessage.id);
            }
            const result = await sendAttachmentAction(formData);
            if (result.success) {
                dispatchNotificationRefresh({ reason: "chat-sent", roomId: conversationId });
                setReplyToMessage(null);
                await onTopicActivity?.();
                await loadReplies();
                requestAnimationFrame(() => {
                    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                });
            } else {
                alert(`Failed to send attachment: ${result.message}`);
            }
        } catch (e) {
            console.error("Failed to send attachment:", e);
            alert("An error occurred while uploading the file.");
        } finally {
            setIsUploading(false);
        }
    };

    const topicDescription = typeof message.content?.body === "string" ? message.content.body.trim() : "";
    const effectiveStarterBody = editedStarterBody ?? topicDescription;
    const isOwnStarter = !!user?.did && message.createdBy === user.did;
    const topicCreatorName = formatCompactDisplayName(message.author?.name, message.createdBy);
    const starterAuthorName = formatCompactDisplayName(message.author?.name, message.createdBy);
    const starterCreatedAt = new Date(message.createdAt);

    return (
        <div
            ref={cardRef}
            id={getMessageElementId(messageId)}
            data-message-id={messageId}
            className={`my-3 w-full rounded-xl shadow-sm transition-all ${CHAT_TOPIC_BACKGROUND_CLASS} ${isTopicOpen ? "" : "hover:border-[#cddda2] hover:shadow-md"}`}
        >
            {/* Header row — always visible, click to toggle */}
            <div
                className={`flex cursor-pointer flex-col gap-2 px-3 text-left sm:flex-row sm:items-start sm:justify-between ${isTopicOpen ? "py-3" : "py-4"}`}
                onClick={handleToggle}
            >
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{thread.title}</p>
                    {thread.hashtags && thread.hashtags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                            {thread.hashtags.map((tag: string) => (
                                <span
                                    key={tag}
                                    className="rounded-full bg-[hsl(var(--founding-member-bg))] px-1.5 py-0.5 text-xs font-medium text-[hsl(var(--founding-member-foreground))]"
                                >
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}
                    {!isTopicOpen && effectiveStarterBody && (
                        <p className="mt-1 line-clamp-2 text-sm text-gray-600">{effectiveStarterBody}</p>
                    )}
                </div>
                <div className="flex shrink-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs text-gray-500 sm:max-w-[16rem] sm:justify-end sm:text-right">
                    <div className="min-w-0">
                        <div>{formatTopicHeaderDate(message)}</div>
                        <div>{topicCreatorName}</div>
                    </div>
                    <div className="flex items-center gap-2 text-gray-400">
                        <div className="relative">
                            <HiLightBulb className={`h-5 w-5 ${isTopicOpen ? "text-amber-500" : "text-gray-400"}`} />
                            {!isTopicOpen && unreadCount > 0 && (
                                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white">
                                    {unreadCount}
                                </span>
                            )}
                        </div>
                        <span>
                            {thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"}
                        </span>
                    </div>
                </div>
            </div>

            {/* Expanded body */}
            {isTopicOpen && (
                <div className="border-t border-[#DDEBB8]">
                    {effectiveStarterBody && (
                        <div
                            className={`flex px-3 py-2 text-left ${isOwnStarter ? "justify-end" : "justify-start"}`}
                            onMouseEnter={() => !isMobile && setIsHoveringStarter(true)}
                            onMouseLeave={() => !isMobile && setIsHoveringStarter(false)}
                            onClick={() => isMobile && isOwnStarter && setIsHoveringStarter((value) => !value)}
                        >
                            {isEditingStarter ? (
                                <div
                                    className={`w-[96%] rounded-lg p-3 shadow-sm sm:max-w-[92%] ${CHAT_STANDARD_BUBBLE_CLASS}`}
                                >
                                    <textarea
                                        value={editingStarterText}
                                        onChange={(e) => setEditingStarterText(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Escape") {
                                                setIsEditingStarter(false);
                                                setEditingStarterText("");
                                            }
                                        }}
                                        rows={5}
                                        className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-blue-300"
                                    />
                                    <div className="flex justify-end gap-1">
                                        <button
                                            onClick={() => {
                                                setIsEditingStarter(false);
                                                setEditingStarterText("");
                                            }}
                                            className="text-xs text-gray-500 hover:text-gray-700"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => void handleStarterEditSubmit()}
                                            className="text-xs font-medium text-[hsl(var(--task-link))] hover:text-[hsl(var(--task-link-hover))]"
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className={`relative w-[96%] overflow-visible rounded-lg p-3 shadow-sm sm:max-w-[92%] ${CHAT_STANDARD_BUBBLE_CLASS}`}
                                >
                                    <div className="mb-2 text-right text-[10px] leading-none text-gray-400">
                                        {formatTopicPostTimestamp(starterCreatedAt, false)}
                                    </div>
                                    <div className="text-sm leading-relaxed text-gray-700">
                                        {renderFormattedChatBody(effectiveStarterBody, {
                                            format: (message as any)?.format,
                                            markdownClassName:
                                                "formatted max-w-none text-sm leading-relaxed text-gray-700",
                                        })}
                                    </div>
                                    {isOwnStarter && isHoveringStarter && (
                                        <div
                                            className="absolute -bottom-3 right-2 z-10"
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            <div className="flex items-center gap-0.5 rounded-full border border-gray-200 bg-white p-0.5 shadow-sm">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => {
                                                        setIsEditingStarter(true);
                                                        setEditingStarterText(effectiveStarterBody);
                                                    }}
                                                >
                                                    <GrEdit className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                    <div className="mt-2 text-right text-xs font-medium text-gray-500">
                                        {starterAuthorName}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Replies */}
                    <div className="space-y-2 px-3 py-2">
                        {isLoading && <p className="py-2 text-center text-xs text-gray-400">Loading replies...</p>}
                        {!isLoading && replies.length === 0 && (
                            <p className="py-2 text-center text-xs text-gray-400">No replies yet. Be the first.</p>
                        )}
                        {replies.map((reply, replyIndex) => {
                            const isOwn = reply.createdBy === user?.did;
                            const isEditing = editingReplyId === reply.id;
                            const replyCreatedAt = new Date(reply.createdAt);
                            const previousVisibleCreatedAt =
                                replyIndex === 0 ? starterCreatedAt : new Date(replies[replyIndex - 1].createdAt);
                            const includeReplyDate =
                                !Number.isNaN(replyCreatedAt.getTime()) &&
                                !Number.isNaN(previousVisibleCreatedAt.getTime()) &&
                                !isSameCalendarDate(replyCreatedAt, previousVisibleCreatedAt);
                            const isFirstInChain =
                                replyIndex === 0 ||
                                replies[replyIndex - 1].createdBy !== reply.createdBy ||
                                new Date(reply.createdAt).getTime() -
                                    new Date(replies[replyIndex - 1].createdAt).getTime() >
                                    5 * 60 * 1000;
                            return (
                                <div
                                    key={reply.id}
                                    id={getMessageElementId(reply.id)}
                                    data-message-id={reply.id}
                                    className={`relative flex w-full ${isFirstInChain ? "mt-3" : "mt-px"} ${isOwn ? "justify-end" : "justify-start"}`}
                                    onMouseEnter={() => !isMobile && setHoveredReplyId(reply.id)}
                                    onMouseLeave={() => {
                                        if (!isMobile) {
                                            setHoveredReplyId(null);
                                        }
                                    }}
                                    onClick={() => {
                                        if (isMobile && !isEditing) {
                                            setHoveredReplyId((current) => (current === reply.id ? null : reply.id));
                                            setPickerOpenForReply((current) => (current === reply.id ? current : null));
                                        }
                                    }}
                                >
                                    <div
                                        className={`relative flex w-[96%] flex-col overflow-visible shadow-sm sm:max-w-[92%] ${CHAT_STANDARD_BUBBLE_CLASS}`}
                                        style={{ borderRadius: "12px" }}
                                    >
                                        <div className="px-3 py-1.5">
                                            <div className="mb-2 text-right text-[10px] leading-none text-gray-400">
                                                {formatTopicPostTimestamp(replyCreatedAt, includeReplyDate)}
                                            </div>
                                            {isEditing ? (
                                                <div className="flex flex-col gap-1">
                                                    <textarea
                                                        value={editingReplyText}
                                                        onChange={(e) => setEditingReplyText(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Escape") {
                                                                setEditingReplyId(null);
                                                                setEditingReplyText("");
                                                            }
                                                        }}
                                                        rows={5}
                                                        className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-blue-300"
                                                    />
                                                    <div className="flex justify-end gap-1">
                                                        <button
                                                            onClick={() => {
                                                                setEditingReplyId(null);
                                                                setEditingReplyText("");
                                                            }}
                                                            className="text-xs text-gray-500 hover:text-gray-700"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            onClick={() => void handleEditSubmit(reply.id)}
                                                            className="text-xs font-medium text-[hsl(var(--task-link))] hover:text-[hsl(var(--task-link-hover))]"
                                                        >
                                                            Save
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <MessageRenderer message={reply} />
                                            )}
                                            {(hoveredReplyId === reply.id || pickerOpenForReply === reply.id) &&
                                                !isEditing && (
                                                    <div
                                                        className="absolute -bottom-3 right-2 z-10"
                                                        onClick={(event) => event.stopPropagation()}
                                                    >
                                                        <div className="flex flex-wrap items-center justify-end gap-0.5 rounded-full border border-gray-200 bg-white p-0.5 shadow-sm">
                                                            {isOwn && (
                                                                <>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8"
                                                                        onClick={() => {
                                                                            setEditingReplyId(reply.id);
                                                                            setEditingReplyText(
                                                                                (reply.content?.body as string) || "",
                                                                            );
                                                                        }}
                                                                    >
                                                                        <GrEdit className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8"
                                                                        onClick={() => void handleDeleteReply(reply.id)}
                                                                    >
                                                                        <GrTrash className="h-4 w-4" />
                                                                    </Button>
                                                                </>
                                                            )}
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8"
                                                                onClick={() => setReplyToMessage(reply)}
                                                            >
                                                                <MdReply className="h-4 w-4" />
                                                            </Button>
                                                            <Popover
                                                                open={pickerOpenForReply === reply.id}
                                                                onOpenChange={(open) =>
                                                                    setPickerOpenForReply(open ? reply.id : null)
                                                                }
                                                            >
                                                                <PopoverTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8"
                                                                    >
                                                                        <BsEmojiSmile className="h-4 w-4" />
                                                                    </Button>
                                                                </PopoverTrigger>
                                                                <PopoverContent className="w-auto border-none bg-transparent p-0">
                                                                    <LazyEmojiPicker
                                                                        onEmojiClick={(data: EmojiClickData) => {
                                                                            void handleReaction(reply.id, data.emoji);
                                                                            setPickerOpenForReply(null);
                                                                        }}
                                                                    />
                                                                </PopoverContent>
                                                            </Popover>
                                                        </div>
                                                    </div>
                                                )}
                                            <div className="mt-2 text-right text-xs font-medium text-gray-500">
                                                {formatCompactDisplayName(reply.author?.name, reply.createdBy)}
                                            </div>
                                        </div>
                                        {reply.reactions && Object.keys(reply.reactions).length > 0 && (
                                            <div className="-mb-1 flex flex-wrap justify-end gap-1 px-2 pb-1">
                                                {Object.entries(reply.reactions as Record<string, any>).map(
                                                    ([emoji, reactors]) => {
                                                        const reactorList = Array.isArray(reactors) ? reactors : [];
                                                        return (
                                                            <button
                                                                key={emoji}
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    void handleReaction(reply.id, emoji);
                                                                }}
                                                                className="flex min-h-6 items-center rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-sm leading-none"
                                                            >
                                                                {emoji}{" "}
                                                                {reactorList.length > 1 && (
                                                                    <span className="ml-0.5 text-gray-500">
                                                                        {reactorList.length}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        );
                                                    },
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Reply input */}
                    <div className="flex flex-col gap-1 px-3 pb-3 sm:flex-row sm:items-end">
                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                        <div className="order-2 flex items-center justify-between gap-2 sm:order-1 sm:contents">
                            <div className="flex items-center gap-1 sm:contents">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 shrink-0 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 sm:h-8 sm:w-8"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isUploading}
                                    title="Attach file"
                                    aria-label="Attach file"
                                >
                                    {isUploading ? (
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
                                    ) : (
                                        <IoAttach className="h-4 w-4" />
                                    )}
                                </Button>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-9 w-9 shrink-0 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 sm:h-8 sm:w-8"
                                            title="Add emoji"
                                            aria-label="Add emoji"
                                        >
                                            <BsEmojiSmile className="h-4 w-4" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto border-none bg-transparent p-0">
                                        <LazyEmojiPicker
                                            onEmojiClick={(data: EmojiClickData) =>
                                                setTopicReplyText((prev) => prev + data.emoji)
                                            }
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 shrink-0 rounded-full text-[hsl(var(--task-link))] hover:bg-[hsl(var(--founding-member-bg))] sm:hidden"
                                onClick={() => void handleSendReply()}
                                disabled={!replyText.trim() || isSending}
                                title="Send reply"
                                aria-label="Send reply"
                            >
                                <IoSend className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="order-1 min-w-0 flex-1 sm:order-2">
                            {replyToMessage && (
                                <div className="mb-2 rounded-lg border border-l-4 border-slate-200 border-l-slate-300 bg-white/80 px-3 py-2 text-xs text-gray-600">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="font-semibold text-gray-700">
                                                Replying to {replyToMessage.author?.name || "message"}
                                            </div>
                                            <div className="truncate">
                                                {renderMentionsAsDisplayText(
                                                    (replyToMessage.content?.body as string) || "",
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="text-gray-400 hover:text-gray-600"
                                            onClick={() => setReplyToMessage(null)}
                                        >
                                            <IoClose className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="flex items-end gap-1">
                                <MentionsInput
                                    inputRef={replyTextareaRef}
                                    value={replyText}
                                    onChange={(_event, newValue) => {
                                        setTopicReplyText(newValue);
                                        autoGrowReplyTextarea();
                                    }}
                                    placeholder={`Reply to ${thread.title}. Use return for a new line.`}
                                    aria-label={`Reply to ${thread.title}`}
                                    className="min-w-0 flex-1 rounded-2xl bg-gray-50 text-base focus-within:ring-1 focus-within:ring-gray-300"
                                    style={topicReplyMentionsInputStyle}
                                    allowSuggestionsAboveCursor={true}
                                    forceSuggestionsAboveCursor={true}
                                >
                                    <Mention
                                        trigger="@"
                                        data={handleTopicMentionQuery}
                                        style={defaultMentionStyle}
                                        displayTransform={(id, display) => `${display}`}
                                        renderSuggestion={renderCircleSuggestion}
                                        markup="[__display__](/circles/__id__)"
                                    />
                                </MentionsInput>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="hidden h-9 w-9 shrink-0 rounded-full text-[hsl(var(--task-link))] hover:bg-[hsl(var(--founding-member-bg))] sm:flex"
                                    onClick={() => void handleSendReply()}
                                    disabled={!replyText.trim() || isSending}
                                    title="Send reply"
                                    aria-label="Send reply"
                                >
                                    <IoSend className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── New Thread Modal ───────────────────────────────────────────────────────

const NewThreadModal: React.FC<{
    conversationId: string;
    initialTitle?: string;
    onClose: () => void;
    onCreated: (threadId?: string) => void;
}> = ({ conversationId, initialTitle = "", onClose, onCreated }) => {
    const [title, setTitle] = useState(initialTitle);
    const [body, setBody] = useState("");
    const [hashtagInput, setHashtagInput] = useState("");
    const [hashtags, setHashtags] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");

    const addHashtag = () => {
        const tag = hashtagInput.trim().replace(/^#/, "").toLowerCase();
        if (tag && !hashtags.includes(tag)) {
            setHashtags([...hashtags, tag]);
        }
        setHashtagInput("");
    };

    const removeHashtag = (tag: string) => {
        setHashtags(hashtags.filter((t) => t !== tag));
    };

    const handleCreate = async () => {
        if (!title.trim()) {
            setError("Topic title is required");
            return;
        }
        setIsSaving(true);
        setError("");
        try {
            const { createThreadAction } = await import("./mongo-actions");
            const result = await createThreadAction(conversationId, title.trim(), body.trim(), hashtags);
            if (result.success) {
                dispatchNotificationRefresh({ reason: "chat-sent", roomId: conversationId });
                onCreated(result.threadId);
                onClose();
            } else {
                setError(result.message || "Failed to create topic");
            }
        } catch (e) {
            setError("Failed to create topic");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">New topic</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
                        <IoClose className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex flex-col gap-3">
                    <input
                        type="text"
                        aria-label="Topic title"
                        placeholder="Topic title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--task-link))]"
                    />
                    <textarea
                        aria-label="Opening message"
                        placeholder="Opening message"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--task-link))]"
                    />

                    {/* Hashtags */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            aria-label="Hashtags, optional"
                            placeholder="Hashtags, optional"
                            value={hashtagInput}
                            onChange={(e) => setHashtagInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    addHashtag();
                                }
                            }}
                            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--task-link))]"
                        />
                        <button
                            onClick={addHashtag}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                        >
                            Add
                        </button>
                    </div>
                    {hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {hashtags.map((tag) => (
                                <span
                                    key={tag}
                                    className="flex items-center gap-1 rounded-full bg-[hsl(var(--founding-member-bg))] px-2 py-1 text-xs font-medium text-[hsl(var(--founding-member-foreground))]"
                                >
                                    #{tag}
                                    <button onClick={() => removeHashtag(tag)} className="hover:text-red-500">
                                        <IoClose className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    {error && <p className="text-sm text-red-500">{error}</p>}
                </div>

                <div className="flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => void handleCreate()}
                        disabled={isSaving}
                        className="rounded-lg bg-[hsl(var(--task-link))] px-4 py-2 text-sm text-white hover:bg-[hsl(var(--task-link-hover))] disabled:opacity-50"
                    >
                        {isSaving ? "Creating..." : "Create topic"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const ChatRoomComponent: React.FC<{
    chatRoom: ChatRoomDisplay;
    setSelectedChat?: Dispatch<SetStateAction<ChatRoomDisplay | undefined>>;
    circle?: Circle;
    inToolbox?: boolean;
    chatProvider?: "matrix" | "mongo";
}> = ({ chatRoom, setSelectedChat, circle, inToolbox, chatProvider }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const hasInitiallyScrolledRef = useRef(false);
    const userHasScrolledUpRef = useRef(false);
    const lastRenderedMessageRef = useRef<{ count: number; latestCreatedAt: number | null }>({
        count: 0,
        latestCreatedAt: null,
    });
    const inputBarRef = useRef<HTMLDivElement>(null);
    const [inputBarHeight, setInputBarHeight] = useState(56);
    const isCompact = useIsCompact();
    const [hideInput, setHideInput] = useState(false);
    const [inputWidth, setInputWidth] = useState<number | null>(null);
    const [pillStyle, setPillStyle] = useState<React.CSSProperties>({});
    const [jumpButtonRight, setJumpButtonRight] = useState(16);
    const [showJumpToLatest, setShowJumpToLatest] = useState(false);
    const isMobile = useIsMobile();
    const [isLoadingMessages, startLoadingMessagesTransition] = useTransition();
    const inputRef = useRef<HTMLDivElement>(null);
    const [mapOpen] = useAtom(mapOpenAtom);
    const [user] = useAtom(userAtom);
    const [roomMessages, setRoomMessages] = useAtom(roomMessagesAtom);
    const [unreadCounts, setUnreadCounts] = useAtom(unreadCountsAtom);
    const [lastReadTimestamps, setLastReadTimestamps] = useAtom(lastReadTimestampsAtom);
    const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    const [hasOlderMessages, setHasOlderMessages] = useState(true);
    const [showNewThreadModal, setShowNewThreadModal] = useState(false);
    const [newThreadInitialTitle, setNewThreadInitialTitle] = useState("");
    const [openTopicIds, setOpenTopicIds] = useState<Set<string>>(() => new Set());
    const [hasLoadedTopics, setHasLoadedTopics] = useState(false);
    const [isLoadingTopics, setIsLoadingTopics] = useState(false);
    const [isMobileComposerExpanded, setIsMobileComposerExpanded] = useState(false);
    const [mentionCandidates, setMentionCandidates] = useState<Circle[]>([]);
    const [replyToMessage, setReplyToMessage] = useAtom(replyToMessageAtom);
    const router = useRouter();
    const params = useParams<{ handle?: string | string[] }>();
    const routeHandleParam = params?.handle;
    const routeHandle = Array.isArray(routeHandleParam) ? routeHandleParam[0] : routeHandleParam;
    const provider: "mongo" = "mongo";

    const roomId = routeHandle || (chatRoom as any)?._id || (chatRoom as any)?.id || (chatRoom as any)?.handle || null;
    const activeRoomIdRef = useRef<string | null>(roomId);
    const topicLoadRequestRef = useRef(0);
    const conversationType = (chatRoom as any)?.conversationType || (chatRoom as any)?.metadata?.conversationType;
    const repliesDisabled =
        (chatRoom as any)?.repliesDisabled === true || (chatRoom as any)?.metadata?.repliesDisabled === true;
    const isAnnouncementConversation = conversationType === "announcement" || repliesDisabled;

    useEffect(() => {
        if (!replyToMessage) return;
        if (isAnnouncementConversation) {
            setReplyToMessage(null);
            return;
        }
        if (roomId && replyToMessage.roomId !== roomId) {
            setReplyToMessage(null);
        }
    }, [isAnnouncementConversation, replyToMessage, roomId, setReplyToMessage]);

    useEffect(() => {
        let cancelled = false;

        const fromPayload = Array.isArray((chatRoom as any)?.participantCircles)
            ? ((chatRoom as any).participantCircles as Circle[])
            : [];
        const fallbackCandidates = user ? [user] : [];

        const dedupeParticipants = (participants: Circle[]): Circle[] => {
            const seen = new Set<string>();
            const deduped: Circle[] = [];
            for (const participant of participants) {
                const key = participant?.did || participant?._id || participant?.handle;
                if (!key || seen.has(String(key))) {
                    continue;
                }
                seen.add(String(key));
                deduped.push(participant);
            }
            return deduped;
        };

        const payloadCandidates = dedupeParticipants(fromPayload);
        if (payloadCandidates.length > 0) {
            setMentionCandidates(payloadCandidates);
            return () => {
                cancelled = true;
            };
        }

        if ((chatRoom as any)?.isDirect || isAnnouncementConversation || !roomId) {
            setMentionCandidates(fallbackCandidates);
            return () => {
                cancelled = true;
            };
        }

        const loadGroupParticipants = async () => {
            try {
                const result = await getChatRoomMembersAction(roomId);
                if (cancelled) {
                    return;
                }

                if (result.success && Array.isArray(result.members)) {
                    const memberUsers = result.members
                        .map((member: any) => member?.user)
                        .filter((memberUser: Circle | null): memberUser is Circle => !!memberUser);
                    const scopedParticipants = dedupeParticipants(memberUsers);
                    setMentionCandidates(scopedParticipants.length > 0 ? scopedParticipants : fallbackCandidates);
                    return;
                }
            } catch (error) {
                console.error("Failed to load chat participants for mentions:", error);
            }

            if (!cancelled) {
                setMentionCandidates(fallbackCandidates);
            }
        };

        void loadGroupParticipants();

        return () => {
            cancelled = true;
        };
    }, [chatRoom, roomId, user, isAnnouncementConversation]);

    useEffect(() => {
        if (process.env.NODE_ENV === "production") return;
        console.log("CHAT DEBUG provider:", provider);
        console.log("CHAT DEBUG routeParam:", routeHandle ?? null);
        console.log("CHAT DEBUG roomId:", roomId);
        console.log("CHAT DEBUG roomMessages keys:", Object.keys(roomMessages));
    }, [provider, routeHandle, roomId, roomMessages]);

    const { isLoading: isLoadingMongo } = useMongoChat({
        roomId,
        enabled: provider === "mongo" && !!roomId,
        setRoomMessages,
    });

    const hasLoadedTopicsRef = useRef(false);
    const [topicNavigationRequest, setTopicNavigationRequest] = useState<TopicNavigationRequest | null>(null);

    useEffect(() => {
        activeRoomIdRef.current = roomId;
        topicLoadRequestRef.current += 1;
        hasLoadedTopicsRef.current = false;
        setHasLoadedTopics(false);
        setIsLoadingTopics(false);
    }, [roomId]);

    const refreshTopicStarters = useCallback(async () => {
        const targetRoomId = roomId;
        if (!targetRoomId) return;

        const requestId = ++topicLoadRequestRef.current;
        setIsLoadingTopics(true);

        try {
            const { fetchTopicStartersAction } = await import("./mongo-actions");
            const result = await fetchTopicStartersAction(targetRoomId);
            if (activeRoomIdRef.current !== targetRoomId || topicLoadRequestRef.current !== requestId) {
                return;
            }
            if (!result.success || !result.messages) {
                return;
            }

            setRoomMessages((prev) => {
                const existingLooseMessages = (prev[targetRoomId] || []).filter((message) => !(message as any).thread);
                const merged = [...existingLooseMessages, ...result.messages!].sort(
                    (a, b) => getTopicCreationTime(a as any) - getTopicCreationTime(b as any),
                );
                return { ...prev, [targetRoomId]: merged };
            });
            setHasLoadedTopics(true);
        } catch (error) {
            console.error("Failed to refresh topic starters:", error);
        } finally {
            if (activeRoomIdRef.current === targetRoomId && topicLoadRequestRef.current === requestId) {
                setIsLoadingTopics(false);
            }
        }
    }, [roomId, setRoomMessages]);

    useEffect(() => {
        const handleOpenTopic = (event: Event) => {
            const customEvent = event as CustomEvent<{ conversationId?: string; topicId?: string }>;
            const targetConversationId = customEvent.detail?.conversationId;
            const topicId = customEvent.detail?.topicId;
            if (!roomId || !targetConversationId || !topicId || targetConversationId !== roomId) {
                return;
            }

            setOpenTopicIds((prev) => {
                const next = new Set(prev);
                next.add(topicId);
                return next;
            });
            setTopicNavigationRequest({
                topicId,
                nonce: Date.now(),
            });
        };

        window.addEventListener(OPEN_TOPIC_EVENT, handleOpenTopic as EventListener);
        return () => {
            window.removeEventListener(OPEN_TOPIC_EVENT, handleOpenTopic as EventListener);
        };
    }, [roomId]);

    useEffect(() => {
        if (isLoadingMongo || !roomId || hasLoadedTopicsRef.current) return;
        hasLoadedTopicsRef.current = true;
        void refreshTopicStarters();
    }, [isLoadingMongo, roomId, refreshTopicStarters]);

    const loadOlderMessages = async () => {
        if (!roomId || isLoadingOlder || !hasOlderMessages) return;
        const currentMessages = roomMessages[roomId] || [];
        if (currentMessages.length === 0) return;
        const oldestId = currentMessages[0]?.id;
        if (!oldestId) return;
        setIsLoadingOlder(true);
        try {
            const { fetchMongoMessagesAction } = await import("./actions");
            // Fetch messages before the oldest currently loaded one
            // We use a custom approach: fetch 50 messages with _id < oldestId
            const result = await fetchMongoMessagesAction(roomId, undefined, 50);
            if (result.success && result.messages) {
                const olderMessages = result.messages.filter(
                    (msg) => msg.id < oldestId && !currentMessages.some((m) => m.id === msg.id),
                );
                if (olderMessages.length === 0) {
                    setHasOlderMessages(false);
                } else {
                    setRoomMessages((prev) => {
                        const current = prev[roomId] || [];
                        const existingIds = new Set(current.map((m) => m.id));
                        const newOld = olderMessages.filter((m) => !existingIds.has(m.id));
                        return {
                            ...prev,
                            [roomId]: [...newOld, ...current],
                        };
                    });
                    if (olderMessages.length < 50) {
                        setHasOlderMessages(false);
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load older messages:", e);
        } finally {
            setIsLoadingOlder(false);
        }
    };

    const handleDelete = async (message: ChatMessage) => {
        if (window.confirm("Are you sure you want to delete this message?")) {
            const originalRoomMessages = roomMessages[message.roomId] || [];
            const originalIndex = originalRoomMessages.findIndex((m) => m.id === message.id);
            // Optimistic UI update
            setRoomMessages((prev) => {
                const newRoomMessages = { ...prev };
                const currentRoomMessages = newRoomMessages[message.roomId] || [];
                newRoomMessages[message.roomId] = currentRoomMessages.filter((m) => m.id !== message.id);
                return newRoomMessages;
            });

            if (message.status && message.status !== "sent") {
                return;
            }

            try {
                const result = await deleteMongoMessageAction(message.id);

                if (!result.success) {
                    console.error("Failed to delete message:", result.message);
                    // Roll back the optimistic delete so local state matches persisted state.
                    setRoomMessages((prev) => {
                        const current = prev[message.roomId] || [];
                        if (current.some((m) => m.id === message.id)) return prev;
                        const next = [...current];
                        const insertionIndex =
                            originalIndex >= 0 && originalIndex <= next.length ? originalIndex : next.length;
                        next.splice(insertionIndex, 0, message);
                        return { ...prev, [message.roomId]: next };
                    });
                    alert(`Failed to delete message: ${result.message}`);
                }
            } catch (error) {
                console.error("Exception deleting message:", error);
                // Roll back optimistic delete on unexpected failure.
                setRoomMessages((prev) => {
                    const current = prev[message.roomId] || [];
                    if (current.some((m) => m.id === message.id)) return prev;
                    const next = [...current];
                    const insertionIndex =
                        originalIndex >= 0 && originalIndex <= next.length ? originalIndex : next.length;
                    next.splice(insertionIndex, 0, message);
                    return { ...prev, [message.roomId]: next };
                });
                alert("Failed to delete message. Please try again.");
            }
        }
    };

    const handleEdit = (message: ChatMessage) => {
        setEditingMessage(message);
        setReplyToMessage(null); // Clear reply when editing
    };

    const lastReadMessageIdRef = useRef<string | null>(null);

    const markLatestMessageAsRead = useCallback(async () => {
        if (!roomId || messages.length === 0) {
            return;
        }

        const latestMessage = messages[messages.length - 1];
        if (lastReadMessageIdRef.current === latestMessage.id) {
            return;
        }

        lastReadMessageIdRef.current = latestMessage.id;
        const messageTimestamp =
            latestMessage.createdAt instanceof Date
                ? latestMessage.createdAt.getTime()
                : new Date(latestMessage.createdAt).getTime();

        setLastReadTimestamps((prev) => ({
            ...prev,
            [roomId]: messageTimestamp,
        }));

        setUnreadCounts((prev) => {
            const newCounts = { ...prev };
            Object.keys(newCounts).forEach((key) => {
                if (key.startsWith(roomId)) {
                    delete newCounts[key];
                }
            });
            return newCounts;
        });

        try {
            const response = await fetch("/api/notifications/mark-pms-as-read", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomId }),
            });
            dispatchNotificationRefreshIfOk(response, { reason: "pm-notifications-read", roomId });
        } catch (error) {
            console.error("Failed to mark PM notifications as read:", error);
        }
    }, [messages, roomId, setUnreadCounts, setLastReadTimestamps]);

    const scrollToBottom = (behavior: "smooth" | "auto" = "auto") => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior });
        }
    };

    const getBottomDistance = useCallback(() => {
        const container = scrollContainerRef.current;
        if (container) {
            const containerDistance = container.scrollHeight - container.scrollTop - container.clientHeight;
            if (containerDistance > 0) {
                return containerDistance;
            }
        }

        const doc = document.documentElement;
        return doc.scrollHeight - (window.scrollY + window.innerHeight);
    }, []);

    const updateScrollPositionState = useCallback(() => {
        const isAwayFromBottom = getBottomDistance() > CHAT_BOTTOM_THRESHOLD_PX;
        userHasScrolledUpRef.current = isAwayFromBottom;
        setShowJumpToLatest(isAwayFromBottom);
    }, [getBottomDistance]);

    const handleScroll = () => {
        updateScrollPositionState();
    };

    useEffect(() => {
        if (messages.length === 0) return;

        const latestMessage = messages[messages.length - 1];
        const latestCreatedAt =
            latestMessage.createdAt instanceof Date
                ? latestMessage.createdAt.getTime()
                : new Date(latestMessage.createdAt).getTime();
        const previousSnapshot = lastRenderedMessageRef.current;
        const hasNewLatestMessage =
            previousSnapshot.count > 0 &&
            (messages.length > previousSnapshot.count ||
                (previousSnapshot.latestCreatedAt !== null && latestCreatedAt > previousSnapshot.latestCreatedAt));

        if (!hasInitiallyScrolledRef.current) {
            hasInitiallyScrolledRef.current = true;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    scrollToBottom("auto");
                });
            });
        } else if (hasNewLatestMessage && !userHasScrolledUpRef.current) {
            scrollToBottom("smooth");
        }

        lastRenderedMessageRef.current = {
            count: messages.length,
            latestCreatedAt,
        };
    }, [messages]);

    useEffect(() => {
        hasInitiallyScrolledRef.current = false;
        lastRenderedMessageRef.current = {
            count: 0,
            latestCreatedAt: null,
        };
    }, [roomId]);

    useEffect(() => {
        if (!roomId) return;

        const roomMessagesForChat = roomMessages[roomId] || [];
        setMessages(roomMessagesForChat);
    }, [roomId, roomMessages]);

    useEffect(() => {
        setOpenTopicIds(new Set());
        setNewThreadInitialTitle("");
    }, [roomId]);

    const toggleOpenTopic = useCallback((topicId: string) => {
        setOpenTopicIds((prev) => {
            const next = new Set(prev);
            if (next.has(topicId)) {
                next.delete(topicId);
            } else {
                next.add(topicId);
            }
            return next;
        });
    }, []);

    const topicCount = useMemo(() => getTopicIndexMessages(messages).length, [messages]);

    const openNewTopicModal = useCallback(
        (useFirstTopicDefault = false) => {
            setNewThreadInitialTitle(useFirstTopicDefault ? getInitialTopicTitle(topicCount) : "");
            setShowNewThreadModal(true);
        },
        [topicCount],
    );

    const openTopicComposerFromMobile = useCallback(() => {
        openNewTopicModal(topicCount <= 0);
    }, [openNewTopicModal, topicCount]);

    const mobileBottomNewTopicAction =
        isMobile && !isAnnouncementConversation ? (
            <div className="pb-[calc(88px+env(safe-area-inset-bottom))] pt-3">
                <Button
                    type="button"
                    className="h-11 w-full rounded-full bg-[hsl(var(--task-link))] text-white hover:bg-[hsl(var(--task-link-hover))]"
                    onClick={openTopicComposerFromMobile}
                    title="New topic"
                >
                    <IoAddCircleOutline className="mr-2 h-5 w-5" />
                    New topic
                </Button>
            </div>
        ) : null;

    useEffect(() => {
        requestAnimationFrame(() => {
            updateScrollPositionState();
        });
    }, [messages, updateScrollPositionState]);

    useEffect(() => {
        const handleWindowScroll = () => {
            updateScrollPositionState();
        };

        window.addEventListener("scroll", handleWindowScroll, { passive: true });
        window.addEventListener("resize", handleWindowScroll);
        return () => {
            window.removeEventListener("scroll", handleWindowScroll);
            window.removeEventListener("resize", handleWindowScroll);
        };
    }, [updateScrollPositionState]);

    const messagesRef = useRef<ChatMessage[]>([]);
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        markLatestMessageAsRead(); // Mark the latest message as read when messages update
    }, [messages, markLatestMessageAsRead]);

    useEffect(() => {
        const updateInputWidth = () => {
            if (inputRef.current) {
                setInputWidth(inputRef.current.clientWidth);
            }
        };
        setHideInput(false);
        updateInputWidth();
        window.addEventListener("resize", updateInputWidth);
        return () => window.removeEventListener("resize", updateInputWidth);
    }, [mapOpen]);

    useEffect(() => {
        const calculatePillPosition = () => {
            const container = inputRef.current;
            if (container) {
                const rect = container.getBoundingClientRect();
                setPillStyle({
                    left: `${rect.left + rect.width / 2}px`,
                    transform: "translateX(-50%)",
                });
                setJumpButtonRight(Math.max(16, window.innerWidth - rect.right + 16));
            }
        };

        calculatePillPosition();
        window.addEventListener("resize", calculatePillPosition);
        return () => window.removeEventListener("resize", calculatePillPosition);
    }, [messages]);

    const handleMessagesRendered = () => {};
    const scrollBottomPadding = inputBarHeight + (isMobile ? 96 : 16);

    useEffect(() => {
        const el = inputBarRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => {
            setInputBarHeight(el.offsetHeight);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [replyToMessage]);

    return (
        <>
            <div
                className={`flex h-full flex-1 items-start justify-center ${inToolbox ? "bg-[#fbfbfb]" : "min-h-screen"}`}
                style={{
                    flexGrow: isCompact || inToolbox ? "1" : "3",
                    maxWidth: isCompact || inToolbox ? "none" : "700px",
                }}
            >
                <div ref={inputRef} className="relative flex h-full w-full flex-col">
                    {!inToolbox && circle && (
                        <Link href={`/circles/${circle.handle}`}>
                            <div className="fixed top-4 z-[20] cursor-pointer" style={pillStyle}>
                                <div className="flex items-center gap-2 rounded-full bg-white p-2 shadow-lg hover:bg-gray-100">
                                    <CirclePicture circle={circle} size="24px" />
                                    <span className="text-sm font-semibold">{circle.name}</span>
                                </div>
                            </div>
                        </Link>
                    )}
                    {inToolbox ? (
                        <div
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            className="overflow-y-auto p-4"
                            style={{
                                overflowAnchor: "auto",
                                height: "calc(100vh - 300px)",
                                paddingBottom: scrollBottomPadding,
                            }}
                        >
                            <DmConnectBanner chatRoom={chatRoom} user={user} />
                            {!isLoadingMongo && hasOlderMessages && (
                                <div className="flex justify-center py-2">
                                    <button
                                        onClick={() => void loadOlderMessages()}
                                        disabled={isLoadingOlder}
                                        className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs text-gray-500 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        {isLoadingOlder ? "Loading..." : "Load older messages"}
                                    </button>
                                </div>
                            )}
                            {(isLoadingMessages || isLoadingMongo || isLoadingTopics) && (
                                <div className="text-center text-gray-500">Loading messages...</div>
                            )}
                            {!isLoadingMessages && (
                                <ChatMessages
                                    messages={messages}
                                    messagesEndRef={messagesEndRef}
                                    onMessagesRendered={handleMessagesRendered}
                                    handleDelete={handleDelete}
                                    handleEdit={handleEdit}
                                    canReply={!isAnnouncementConversation}
                                    chatProvider={provider}
                                    isDirect={!!(chatRoom as any)?.isDirect}
                                    conversationId={roomId || ""}
                                    currentUser={user}
                                    onTopicOpen={() => {}}
                                    onTopicLoaded={() => {}}
                                    topicNavigationRequest={topicNavigationRequest}
                                    openTopicIds={openTopicIds}
                                    onToggleTopic={toggleOpenTopic}
                                    onCreateTopic={() => openNewTopicModal(true)}
                                    onTopicActivity={refreshTopicStarters}
                                    bottomAction={mobileBottomNewTopicAction}
                                    topicsLoaded={hasLoadedTopics}
                                    mentionCandidates={mentionCandidates}
                                />
                            )}
                        </div>
                    ) : (
                        <div
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            className="flex-grow overflow-y-auto p-4"
                            style={{ overflowAnchor: "auto", paddingBottom: scrollBottomPadding }}
                        >
                            <DmConnectBanner chatRoom={chatRoom} user={user} />
                            {!isLoadingMongo && hasOlderMessages && (
                                <div className="flex justify-center py-2">
                                    <button
                                        onClick={() => void loadOlderMessages()}
                                        disabled={isLoadingOlder}
                                        className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs text-gray-500 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        {isLoadingOlder ? "Loading..." : "Load older messages"}
                                    </button>
                                </div>
                            )}
                            {(isLoadingMessages || isLoadingMongo || isLoadingTopics) && (
                                <div className="text-center text-gray-500">Loading messages...</div>
                            )}
                            {!isLoadingMessages && (
                                <ChatMessages
                                    messages={messages}
                                    messagesEndRef={messagesEndRef}
                                    onMessagesRendered={handleMessagesRendered}
                                    handleDelete={handleDelete}
                                    handleEdit={handleEdit}
                                    canReply={!isAnnouncementConversation}
                                    chatProvider={provider}
                                    isDirect={!!(chatRoom as any)?.isDirect}
                                    conversationId={roomId || ""}
                                    currentUser={user}
                                    onTopicOpen={() => {}}
                                    onTopicLoaded={() => {}}
                                    topicNavigationRequest={topicNavigationRequest}
                                    openTopicIds={openTopicIds}
                                    onToggleTopic={toggleOpenTopic}
                                    onCreateTopic={() => openNewTopicModal(true)}
                                    onTopicActivity={refreshTopicStarters}
                                    bottomAction={mobileBottomNewTopicAction}
                                    topicsLoaded={hasLoadedTopics}
                                    mentionCandidates={mentionCandidates}
                                />
                            )}
                        </div>
                    )}

                    {showJumpToLatest && (
                        <Button
                            type="button"
                            size="icon"
                            onClick={() => {
                                userHasScrolledUpRef.current = false;
                                setShowJumpToLatest(false);
                                scrollToBottom("smooth");
                            }}
                            className="fixed z-20 h-10 w-10 rounded-full border border-[hsl(var(--task-priority-low-bg))] bg-[hsl(var(--founding-member-bg))] text-[hsl(var(--task-link))] shadow-lg hover:bg-[hsl(var(--task-priority-low-bg))]"
                            style={{
                                right: `${jumpButtonRight}px`,
                                bottom: `${inputBarHeight + (isMobile ? 84 : 20)}px`,
                            }}
                            title="Jump to latest"
                            aria-label="Jump to latest"
                        >
                            <IoArrowDown className="h-5 w-5" />
                        </Button>
                    )}

                    {!isMobile && (
                        <div
                            ref={inputBarRef}
                            className="fixed z-10 box-border"
                            style={{
                                width: inputWidth ? `${inputWidth}px` : "100%",
                                bottom: "0px",
                                opacity: hideInput ? 0 : 1,
                            }}
                        >
                            <div className="flex items-end bg-[#fbfbfb] pb-1">
                                {isAnnouncementConversation ? (
                                    <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                                        Replies are disabled for this system conversation.
                                    </div>
                                ) : (
                                    <Button
                                        type="button"
                                        className="h-11 w-full rounded-full bg-[hsl(var(--task-link))] text-white hover:bg-[hsl(var(--task-link-hover))]"
                                        onClick={() => openNewTopicModal(false)}
                                        title="New topic"
                                    >
                                        <HiLightBulb className="mr-2 h-5 w-5" />
                                        New topic
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {isMobile && !inToolbox && (
                <div className="fixed left-4 top-4 z-20 flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-full bg-[#f1f1f1] hover:bg-[#cecece]"
                        onClick={() => router.push("/chat")}
                        aria-label="Back to conversations"
                    >
                        <IoArrowBack className="h-5 w-5" />
                    </Button>
                    {!isAnnouncementConversation && (
                        <Button
                            type="button"
                            className="h-9 rounded-full bg-[hsl(var(--task-link))] px-3 text-sm text-white shadow-sm hover:bg-[hsl(var(--task-link-hover))]"
                            onClick={openTopicComposerFromMobile}
                            title="New topic"
                        >
                            <IoAddCircleOutline className="mr-1.5 h-4 w-4" />
                            <span className="max-w-[6.5rem] truncate">New topic</span>
                        </Button>
                    )}
                </div>
            )}
            {showNewThreadModal && roomId && (
                <NewThreadModal
                    conversationId={roomId}
                    initialTitle={newThreadInitialTitle}
                    onClose={() => setShowNewThreadModal(false)}
                    onCreated={(threadId) => {
                        hasLoadedTopicsRef.current = false;
                        setNewThreadInitialTitle("");
                        void refreshTopicStarters();
                        if (threadId) {
                            setOpenTopicIds((prev) => {
                                const next = new Set(prev);
                                next.add(threadId);
                                return next;
                            });
                        }
                    }}
                />
            )}
        </>
    );
};
