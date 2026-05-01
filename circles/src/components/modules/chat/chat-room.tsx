//chat-room.tsx - chat room component, shows chat messages and input
"use client";

import { Dispatch, KeyboardEvent, SetStateAction, useCallback, useMemo, useTransition } from "react";
import { Circle, ChatMessage, ChatRoomDisplay, ReactionAggregation } from "@/models/models";
import { mapOpenAtom, replyToMessageAtom, roomMessagesAtom, userAtom, unreadCountsAtom, lastReadTimestampsAtom } from "@/lib/data/atoms";
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
import { IoArrowBack, IoClose, IoSend, IoAddCircleOutline, IoArrowDown, IoAttach, IoDocumentText, IoTimeOutline, IoWarningOutline } from "react-icons/io5";
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

const renderMentionsAsDisplayText = (content: string) => content.replace(CHAT_MENTION_MARKUP_REGEX, "$1");
const isChatMentionLinkHref = (href?: string) => !!href && CHAT_MENTION_LINK_HREF_REGEX.test(href);

type MentionSuggestion = {
    id: string;
    display: string;
    picture?: string;
    handle?: string;
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

const renderChatMessage = (message: ChatMessage, preview?: boolean) => {
    if (preview) {
        return (
            <span>
                <b>{message.author.name}: </b>
                {renderMentionsAsDisplayText((message?.content?.body as string) || "")}
            </span>
        );
    } else {
        const body = (message?.content?.body as string) || "";
        const replyTo = message.replyTo;
        const hasInlineReply = body.includes("\n\n") && body.startsWith("> ");
        const isReply = !!replyTo || hasInlineReply;
        const replyText = hasInlineReply ? body.substring(body.indexOf("\n\n") + 2) : body;
        const originalMessage = hasInlineReply
            ? renderMentionsAsDisplayText(body.substring(body.indexOf("> ") + 2, body.indexOf("\n\n")))
            : renderMentionsAsDisplayText((replyTo?.content?.body as string) || "");
        const originalAuthor = hasInlineReply
            ? originalMessage.substring(1, originalMessage.indexOf(">"))
            : replyTo?.author?.name || replyTo?.author?._id || "";
        const originalAuthorColor = generateColorFromString(originalAuthor);
        const isMarkdown = (message as any)?.format === "markdown";
        const hasMentionMarkup = CHAT_MENTION_MARKUP_TEST_REGEX.test(replyText);
        const shouldEmphasizeLinks = isNonPreviewSystemSenderMessage(message);

        return (
            <div className="max-w-full overflow-hidden">
                {isReply && (
                    <div className="mb-2 rounded-md border-l-4 border-gray-400 bg-[#f3f3f3] p-2 pl-2">
                        <div
                            className="text-xs font-semibold"
                            style={{ color: originalAuthorColor }}
                        >
                            {originalAuthor}
                        </div>
                        <p className="truncate text-sm text-gray-600">
                            {hasInlineReply ? originalMessage.substring(originalMessage.indexOf(">") + 2) : originalMessage}
                        </p>
                    </div>
                )}
                {isMarkdown || hasMentionMarkup ? (
                    <MemoizedReactMarkdown
                        className={shouldEmphasizeLinks ? "formatted max-w-none text-sm leading-relaxed" : undefined}
                        components={{
                            a: ({ href, className, ...props }) => (
                                <a
                                    href={href}
                                    className={
                                        isChatMentionLinkHref(href)
                                            ? `inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700 no-underline hover:underline ${className ?? ""}`.trim()
                                            : `${shouldEmphasizeLinks ? "text-blue-700 underline underline-offset-2 hover:text-blue-800" : ""} ${className ?? ""}`.trim()
                                    }
                                    {...props}
                                />
                            ),
                        }}
                    >
                        {replyText}
                    </MemoizedReactMarkdown>
                ) : (
                    <RichText content={replyText} />
                )}
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

    const runContactAction = async (
        action: () => Promise<{ success: boolean; message: string }>,
        title: string,
    ) => {
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
                            void runContactAction(
                                () => sendConnectRequestAction(otherParticipant.did!),
                                "Connect",
                            )
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
                                                className="rounded-lg object-contain max-h-60 w-full cursor-pointer hover:opacity-90"
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
                                        className="flex items-center gap-2 rounded-lg bg-gray-100 p-3 hover:bg-gray-200 transition-colors"
                                    >
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                                            <IoDocumentText className="h-6 w-6" />
                                        </div>
                                        <div className="flex flex-col overflow-hidden">
                                            <span className="truncate font-medium text-gray-700">{attachment.name}</span>
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
                    {isEdited && <span className="ml-1 text-xs text-gray-500 italic">(edited)</span>}
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
                                            ? `inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700 no-underline hover:underline ${className ?? ""}`.trim()
                                            : `${shouldEmphasizeLinks ? "text-blue-700 underline underline-offset-2 hover:text-blue-800" : ""} ${className ?? ""}`.trim()
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
};

const sameAuthor = (message1: ChatMessage, message2: ChatMessage) => {
    if (!message1?.createdBy || !message2?.createdBy) return false;
    if (message1.type !== "m.room.message" || message2.type !== "m.room.message") return false;
    return message1.createdBy === message2.createdBy;
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

    const orderedMessages = [...messages]
        .filter(
            (message) =>
                (message.type === "m.room.message" || message.type === "m.room.member" || message.type === "m.room.notice") &&
                !(message as any).threadId,
        )
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return (
        <div>
            {orderedMessages.reduce<React.ReactNode[]>((acc, message, index) => {
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
                            className={`group relative mb-1 flex gap-2 ${isFirstInChain ? "mt-4" : "mt-1"} ${hoveredMessageId === message.id ? "z-10" : ""} ${isOwnMessage ? "justify-end" : "justify-start"}`}
                            onMouseEnter={() => !isMobile && setHoveredMessageId(message.id)}
                            onMouseLeave={() => !isMobile && setHoveredMessageId(null)}
                            onTouchStart={() => handleTouchStart(message)}
                            onTouchEnd={handleTouchEnd}
                        >
                            {!isDirect && !isOwnMessage && (
                                isLastInChain ? (
                                    <CirclePicture
                                        circle={message.author!}
                                        size="28px"
                                        className="self-end mb-1 flex-shrink-0"
                                        openPreview={!isNonPreviewSender}
                                    />
                                ) : (
                                    <div className="w-7 flex-shrink-0" />
                                )
                            )}

                            {/* Topic card — renders inline for topic-starter messages */}
                            {(message as any).thread ? (
                                <div className="w-full">
                                    <TopicCard
                                        message={message}
                                        conversationId={conversationId || ""}
                                        user={currentUser}
                                        onTopicOpen={onTopicOpen}
                                        onTopicLoaded={onTopicLoaded}
                                    />
                                </div>
                            ) : null}
                            {!(message as any).thread && (
                            <div className="relative flex min-w-[100px] max-w-[75%] flex-col">
                                <div className={`${isOwnMessage ? "bg-blue-100" : "bg-white"} p-2 pr-4 shadow-md ${bubbleStatusClasses}`} style={{ borderRadius: bubbleRadius }}>
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
                                        <div className="mt-0 flex items-center gap-1 text-[9px] text-gray-400 justify-end">
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
                                    <div className={`relative -mt-3 z-10 flex flex-wrap gap-1 px-1 ${isOwnMessage ? "justify-end" : "justify-start"}`}>
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
                                                {reactions.length > 1 && <span className="ml-1 text-gray-600">{reactions.length}</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {(hoveredMessageId === message.id || pickerOpenForMessage === message.id) && (
                                    <div className={`absolute bottom-1 z-10 flex items-center gap-0.5 rounded-full border border-gray-200 bg-white p-0.5 shadow-sm ${isOwnMessage ? "left-0" : "right-0"}`}>
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

                            {!isDirect && isOwnMessage && (
                                isLastInChain ? (
                                    <CirclePicture
                                        circle={message.author!}
                                        size="28px"
                                        className="self-end mb-1 flex-shrink-0"
                                        openPreview={false}
                                    />
                                ) : (
                                    <div className="w-7 flex-shrink-0" />
                                )
                            )}
                        </div>,
                    );
                }

                return acc;
            }, [])}
            <div ref={messagesEndRef} />
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
};

const ChatInput = ({ roomId, editingMessage, setEditingMessage, mentionCandidates }: ChatInputProps) => {
    const [user] = useAtom(userAtom);
    const [newMessage, setNewMessage] = useState("");
    const [replyToMessage, setReplyToMessage] = useAtom(replyToMessageAtom);
    const [, setRoomMessages] = useAtom(roomMessagesAtom);
    const isMobile = useIsMobile();

    const mentionSuggestions = useMemo<MentionSuggestion[]>(() => {
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
    }, [mentionCandidates]);

    const handleChatMentionQuery = useCallback(
        (query: string, callback: (data: MentionSuggestion[]) => void) => {
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
        },
        [mentionSuggestions],
    );
    // Populate input when editing
    useEffect(() => {
        if (editingMessage) {
            setNewMessage(editingMessage.content.body as string);
        }
    }, [editingMessage]);

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
            editingMessageId: editingMessage?.id
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
            roomId
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
                content: trimmedContent
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
                setReplyToMessage(null);
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
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (editingMessage) {
                handleEditSubmit();
            } else {
                handleSendMessage();
            }
        } else if (e.key === "Escape" && editingMessage) {
            setEditingMessage(null);
            setNewMessage("");
        }
    };

    return (
        <div className="flex w-full flex-col">
            {editingMessage && (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-blue-100 p-2">
                    <div className="flex-grow overflow-hidden">
                        <div className="font-semibold text-blue-700">Editing message</div>
                        <p className="truncate text-sm text-blue-600">{editingMessage.content.body as string}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => { setEditingMessage(null); setNewMessage(""); }}>
                        <IoClose className="h-5 w-5" />
                    </Button>
                </div>
            )}
            {replyToMessage && !editingMessage && (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-gray-200 p-2">
                    <div className="flex-grow overflow-hidden">
                        <div className="font-semibold text-gray-700">Replying to {replyToMessage.author.name}</div>
                        <p className="truncate text-sm text-gray-600">{replyToMessage.content.body as string}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setReplyToMessage(null)}>
                        <IoClose className="h-5 w-5" />
                    </Button>
                </div>
            )}
            <div className="flex w-full items-end gap-2">
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileSelect}
                />
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-10 w-10 shrink-0 rounded-full text-gray-500 hover:bg-gray-200"
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
                        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full text-gray-500 hover:bg-gray-200">
                            <BsEmojiSmile className="h-5 w-5" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto border-none bg-transparent p-0">
                        <LazyEmojiPicker onEmojiClick={(data: EmojiClickData) => setNewMessage((prev) => prev + data.emoji)} />
                    </PopoverContent>
                </Popover>

                <MentionsInput
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleCommentKeyDown}
                    placeholder="Type message and click icon or return to send..."
                    className="flex-grow rounded-[20px] bg-gray-100"
                    style={defaultMentionsInputStyle}
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
                
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-10 w-10 shrink-0 rounded-full text-blue-600 hover:bg-blue-50"
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim()}
                >
                    <IoSend className="h-5 w-5" />
                </Button>
                {isMobile && (
                    <Button onClick={handleSendMessage} className="ml-2 rounded-full text-white">
                        <IoSend />
                    </Button>
                )}
            </div>
        </div>
    );
};

// ─── Topic inline card (self-contained, expands in place) ──────────────────

const getTopicStorageKey = (conversationId: string) => `kamooni_open_topics_${conversationId}`;
const getTopicLastSeenKey = (conversationId: string, topicId: string) => `kamooni_topic_lastseen_${conversationId}_${topicId}`;

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
}> = ({ message, conversationId, user, onTopicOpen, onTopicLoaded }) => {
    const thread = message.thread;
    const messageId = message.id || message._id;

    const [isOpen, setIsOpen] = useState<boolean>(() => {
        const openIds = getOpenTopicIds(conversationId);
        return openIds.has(messageId);
    });

    const [replies, setReplies] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [replyText, setReplyText] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [unreadCount, setUnreadCount] = useState<number>(0);
    const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
    const [editingReplyText, setEditingReplyText] = useState("");
    const [hoveredReplyId, setHoveredReplyId] = useState<string | null>(null);
    const [pickerOpenForReply, setPickerOpenForReply] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isMobile = useIsMobile();

    // Load replies on mount if topic starts open
    useEffect(() => {
        if (isOpen) {
            void loadReplies();
            onTopicOpen?.();
        } else {
            void computeUnreadCount();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-check unread count whenever replyCount changes (picks up new replies without refresh)
    useEffect(() => {
        if (!isOpen) {
            void computeUnreadCount();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [thread?.replyCount]);

    if (!thread) return null;

    const computeUnreadCount = async () => {
        try {
            const { fetchThreadRepliesAction } = await import("./mongo-actions");
            const result = await fetchThreadRepliesAction(messageId);
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
            const result = await fetchThreadRepliesAction(messageId);
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
                        content: { body: r.body },
                        attachments: r.attachments,
                        reactions: reactionMap,
                        createdAt: r.createdAt,
                        createdBy: r.senderDid,
                        authorName: r.authorName && !r.authorName.includes(":") && r.authorName.length < 40 ? r.authorName : null,
                        authorPicture: r.authorPicture || null,
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
            // Notify parent that topic has finished loading so it can scroll to bottom
            onTopicLoaded?.();
        }
    };

    const handleToggle = () => {
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
        const trimmed = replyText.trim();
        if (!trimmed || isSending) return;
        setIsSending(true);
        try {
            const { sendThreadReplyAction } = await import("./mongo-actions");
            const result = await sendThreadReplyAction(
                messageId,
                conversationId,
                trimmed,
            );
            if (result.success) {
                setReplyText("");
                await loadReplies();
            }
        } catch (e) {
            console.error("Failed to send topic reply:", e);
        } finally {
            setIsSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handleSendReply();
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

    const handleReaction = async (replyId: string, emoji: string) => {
        try {
            const { toggleMongoReactionAction } = await import("./actions");
            await toggleMongoReactionAction(replyId, emoji);
            await loadReplies();
        } catch (e) {
            console.error("Failed to toggle reaction:", e);
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
            const result = await sendAttachmentAction(formData);
            if (result.success) {
                await loadReplies();
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

    // Opening message rendered as first bubble
    const openingAuthorIsOwn = message.createdBy === user?.did;

    return (
        <div className={`my-2 w-full rounded-xl border shadow-sm transition-all ${isOpen ? "border-gray-300 bg-white" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"}`}>
            {/* Header row — always visible, click to toggle */}
            <div
                className="flex cursor-pointer items-start justify-between gap-2 p-3"
                onClick={handleToggle}
            >
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{thread.title}</p>
                    {thread.hashtags && thread.hashtags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                            {thread.hashtags.map((tag: string) => (
                                <span key={tag} className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}
                    {!isOpen && (
                        <p className="mt-1 text-sm text-gray-600 line-clamp-2">{message.content?.body || ""}</p>
                    )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="relative">
                        <HiLightBulb className={`h-5 w-5 ${isOpen ? "text-blue-500" : "text-gray-400"}`} />
                        {!isOpen && unreadCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white">
                                {unreadCount}
                            </span>
                        )}
                    </div>
                    <span className="text-xs text-gray-400">
                        {isOpen ? "Collapse" : `${thread.replyCount} ${thread.replyCount === 1 ? "reply" : "replies"}`}
                    </span>
                </div>
            </div>

            {/* Expanded body */}
            {isOpen && (
                <div className="border-t border-gray-200">
                    {/* Opening message as first bubble */}
                    <div className={`flex px-3 pt-3 pb-1 ${openingAuthorIsOwn ? "justify-end" : "justify-start"}`}>
                        <div className="flex flex-col max-w-[75%]">
                            <div className={`p-2 pr-4 shadow-md rounded-lg ${openingAuthorIsOwn ? "bg-blue-100" : "bg-white"}`}>
                                {!openingAuthorIsOwn && message.author?.name && (
                                    <p className="text-xs font-semibold mb-0.5" style={{ color: "#6366f1" }}>
                                        {(message.author.name as string).trim().split(" ")[0] || message.author.handle}
                                    </p>
                                )}
                                <p>{message.content?.body || ""}</p>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                            </div>
                        </div>
                    </div>

                    {/* Replies */}
                    <div className="px-3 py-2 space-y-2">
                        {isLoading && (
                            <p className="text-center text-xs text-gray-400 py-2">Loading replies...</p>
                        )}
                        {!isLoading && replies.length === 0 && (
                            <p className="text-center text-xs text-gray-400 py-2">No replies yet. Be the first.</p>
                        )}
                        {replies.map((reply, replyIndex) => {
                            const isOwn = reply.createdBy === user?.did;
                            const isEditing = editingReplyId === reply.id;
                            const nextReply = replies[replyIndex + 1];
                            const isLastInChain =
                                !nextReply ||
                                nextReply.createdBy !== reply.createdBy ||
                                new Date(nextReply.createdAt).getTime() - new Date(reply.createdAt).getTime() > 5 * 60 * 1000;
                            const isFirstInChain =
                                replyIndex === 0 ||
                                replies[replyIndex - 1].createdBy !== reply.createdBy ||
                                new Date(reply.createdAt).getTime() - new Date(replies[replyIndex - 1].createdAt).getTime() > 5 * 60 * 1000;
                            const attachments = reply.attachments as { url: string; name: string; mimeType?: string; size?: number }[] | undefined;
                            return (
                                <div
                                    key={reply.id}
                                    className={`relative flex gap-2 ${isFirstInChain ? "mt-3" : "mt-px"} ${isOwn ? "justify-end" : "justify-start"}`}
                                    onMouseEnter={() => !isMobile && setHoveredReplyId(reply.id)}
                                    onMouseLeave={() => { if (!isMobile) { setHoveredReplyId(null); } }}
                                >
                                    {(hoveredReplyId === reply.id || pickerOpenForReply === reply.id) && !isEditing && (
                                        <div className={`absolute bottom-1 z-10 flex items-center gap-0.5 rounded-full border border-gray-200 bg-white p-0.5 shadow-sm ${isOwn ? "right-0" : "left-0"}`}>
                                            {isOwn && (
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingReplyId(reply.id); setEditingReplyText(reply.content?.body || ""); }}>
                                                    <GrEdit className="h-4 w-4" />
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyText((prev) => prev + `@${reply.authorName || ""} `)}>
                                                <MdReply className="h-4 w-4" />
                                            </Button>
                                            <Popover open={pickerOpenForReply === reply.id} onOpenChange={(open) => setPickerOpenForReply(open ? reply.id : null)}>
                                                <PopoverTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6">
                                                        <BsEmojiSmile className="h-4 w-4" />
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto border-none bg-transparent p-0">
                                                    <LazyEmojiPicker onEmojiClick={(data: EmojiClickData) => { void handleReaction(reply.id, data.emoji); setPickerOpenForReply(null); }} />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                    )}
                                    {!isOwn && (
                                        isLastInChain ? (
                                            <CirclePicture
                                                circle={{ picture: reply.authorPicture ? { url: reply.authorPicture } : undefined, name: reply.authorName || "" } as any}
                                                size="28px"
                                                className="self-end mb-1 flex-shrink-0"
                                            />
                                        ) : (
                                            <div className="w-7 flex-shrink-0" />
                                        )
                                    )}
                                    <div
                                        className={`relative flex max-w-[75%] flex-col overflow-hidden shadow-md ${isOwn ? "bg-blue-100" : "bg-white"}`}
                                        style={{ borderRadius: "12px" }}
                                    >
                                        <div className="px-3 py-1.5">
                                            {isEditing ? (
                                                <div className="flex flex-col gap-1">
                                                    <textarea
                                                        value={editingReplyText}
                                                        onChange={(e) => setEditingReplyText(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleEditSubmit(reply.id); }
                                                            if (e.key === "Escape") { setEditingReplyId(null); setEditingReplyText(""); }
                                                        }}
                                                        rows={2}
                                                        className="w-full resize-none rounded-lg bg-white border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300"
                                                    />
                                                    <div className="flex gap-1 justify-end">
                                                        <button onClick={() => { setEditingReplyId(null); setEditingReplyText(""); }} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                                                        <button onClick={() => void handleEditSubmit(reply.id)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Save</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <p>{reply.content?.body}</p>
                                                    {Array.isArray(attachments) && attachments.length > 0 && (
                                                        <div className="mt-2 space-y-1">
                                                            {attachments.map((att, i) => {
                                                                const isImage = att.mimeType?.startsWith("image/");
                                                                if (isImage) {
                                                                    return (
                                                                        <img key={i} src={att.url} alt={att.name} className="max-h-40 rounded-lg object-contain cursor-pointer hover:opacity-90" onClick={() => window.open(att.url, "_blank")} />
                                                                    );
                                                                }
                                                                return (
                                                                    <a key={i} href={att.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 underline">
                                                                        <IoDocumentText className="h-3 w-3" />{att.name}
                                                                    </a>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            {isLastInChain && (
                                                <div className="mt-0.5 text-right text-[8px] leading-none text-gray-300">
                                                    {new Date(reply.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                                                </div>
                                            )}
                                        </div>
                                        {reply.reactions && Object.keys(reply.reactions).length > 0 && (
                                            <div className={`-mb-1 flex flex-wrap gap-1 px-2 pb-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                                                {Object.entries(reply.reactions as Record<string, any>).map(([emoji, reactors]) => {
                                                    const reactorList = Array.isArray(reactors) ? reactors : [];
                                                    return (
                                                        <button
                                                            key={emoji}
                                                            onClick={() => void handleReaction(reply.id, emoji)}
                                                            className="flex items-center rounded-full border border-gray-200 bg-white px-1 py-0 text-sm leading-none"
                                                        >
                                                            {emoji} {reactorList.length > 1 && <span className="ml-0.5 text-gray-500">{reactorList.length}</span>}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Reply input */}
                    <div className="flex gap-1 items-end px-3 pb-3">
                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                        >
                            {isUploading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" /> : <IoAttach className="h-4 w-4" />}
                        </Button>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                                    <BsEmojiSmile className="h-4 w-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto border-none bg-transparent p-0">
                                <LazyEmojiPicker onEmojiClick={(data: EmojiClickData) => setReplyText((prev) => prev + data.emoji)} />
                            </PopoverContent>
                        </Popover>
                        <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Reply in topic..."
                            rows={1}
                            className="flex-1 resize-none rounded-2xl bg-gray-50 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 rounded-full text-blue-600 hover:bg-blue-100"
                            onClick={() => void handleSendReply()}
                            disabled={!replyText.trim() || isSending}
                        >
                            <IoSend className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── New Thread Modal ───────────────────────────────────────────────────────

const NewThreadModal: React.FC<{
    conversationId: string;
    onClose: () => void;
    onCreated: () => void;
}> = ({ conversationId, onClose, onCreated }) => {
    const [title, setTitle] = useState("");
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
        if (!title.trim()) { setError("Title is required"); return; }
        if (!body.trim()) { setError("Opening message is required"); return; }
        setIsSaving(true);
        setError("");
        try {
            const { createThreadAction } = await import("./mongo-actions");
            const result = await createThreadAction(conversationId, title.trim(), body.trim(), hashtags);
            if (result.success) {
                onCreated();
                onClose();
            } else {
                setError(result.message || "Failed to create thread");
            }
        } catch (e) {
            setError("Failed to create thread");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-xl flex flex-col gap-4 p-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">New Topic</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
                        <IoClose className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex flex-col gap-3">
                    <input
                        type="text"
                        placeholder="Topic title (required)"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <textarea
                        placeholder="Opening message (required)"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />

                    {/* Hashtags */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Add hashtag (optional)"
                            value={hashtagInput}
                            onChange={(e) => setHashtagInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addHashtag(); } }}
                            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            onClick={addHashtag}
                            className="px-3 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
                        >
                            Add
                        </button>
                    </div>
                    {hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {hashtags.map((tag) => (
                                <span key={tag} className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
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

                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => void handleCreate()}
                        disabled={isSaving}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                        {isSaving ? "Creating..." : "Create Topic"}
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
    const [userHasScrolledUp, setUserHasScrolledUp] = useState<boolean>(() => {
        // If any topics are open for this conversation, start with scroll suppressed
        // so the page doesn't jump to bottom before open topics render
        try {
            const roomKey = typeof window !== "undefined"
                ? window.location.pathname.split("/").pop() || ""
                : "";
            if (roomKey) {
                const raw = localStorage.getItem(`kamooni_open_topics_${roomKey}`);
                if (raw) {
                    const ids = JSON.parse(raw);
                    if (Array.isArray(ids) && ids.length > 0) return true;
                }
            }
        } catch {
            // fail silently
        }
        return false;
    });
    const isCompact = useIsCompact();
    const [hideInput, setHideInput] = useState(false);
    const [inputWidth, setInputWidth] = useState<number | null>(null);
    const [pillStyle, setPillStyle] = useState<React.CSSProperties>({});
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
    const [mentionCandidates, setMentionCandidates] = useState<Circle[]>([]);
    const [replyToMessage, setReplyToMessage] = useAtom(replyToMessageAtom);
    const router = useRouter();
    const params = useParams<{ handle?: string | string[] }>();
    const routeHandleParam = params?.handle;
    const routeHandle = Array.isArray(routeHandleParam) ? routeHandleParam[0] : routeHandleParam;
    const provider: "mongo" = "mongo";

    const roomId = routeHandle || (chatRoom as any)?._id || (chatRoom as any)?.id || (chatRoom as any)?.handle || null;
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
                    (msg) => msg.id < oldestId && !currentMessages.some((m) => m.id === msg.id)
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
                    const insertionIndex = originalIndex >= 0 && originalIndex <= next.length ? originalIndex : next.length;
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
            await fetch("/api/notifications/mark-pms-as-read", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomId }),
            });
        } catch (error) {
            console.error("Failed to mark PM notifications as read:", error);
        }
    }, [messages, roomId, setUnreadCounts, setLastReadTimestamps]);

    const scrollToBottom = (behavior: "smooth" | "auto" = "auto") => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior });
        }
    };

    const handleScroll = () => {
        const container = scrollContainerRef.current;
        if (container) {
            const { scrollTop, scrollHeight, clientHeight } = container;
            // A threshold to decide if the user has scrolled up significantly
            if (scrollHeight - scrollTop - clientHeight > 150) {
                setUserHasScrolledUp(true);
            } else {
                setUserHasScrolledUp(false);
            }
        }
    };

    useEffect(() => {
        if (messages.length === 0) return;
        if (!hasInitiallyScrolledRef.current) {
            // First load — wait for DOM to paint before scrolling
            hasInitiallyScrolledRef.current = true;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    scrollToBottom("auto");
                });
            });
            return;
        }
        // Subsequent updates — only scroll if user hasn't scrolled up
        if (!userHasScrolledUp) {
            scrollToBottom("smooth");
        }
    }, [messages, userHasScrolledUp]);


    useEffect(() => {
    if (!roomId) return;

    const roomMessagesForChat = roomMessages[roomId] || [];
    setMessages(roomMessagesForChat);   
    }, [roomId, roomMessages]);

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
            }
        };

        calculatePillPosition();
        window.addEventListener("resize", calculatePillPosition);
        return () => window.removeEventListener("resize", calculatePillPosition);
    }, [messages]);

    const handleMessagesRendered = () => {
        if (!userHasScrolledUp) {
            scrollToBottom();
        }
    };

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
                                height: "calc(100vh - 300px)",
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
                            {(isLoadingMessages || isLoadingMongo) && <div className="text-center text-gray-500">Loading messages...</div>}
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
                                onTopicOpen={() => setUserHasScrolledUp(true)}
                                onTopicLoaded={() => {
                                    requestAnimationFrame(() => scrollToBottom("auto"));
                                }}
                            />
                        )}
                        </div>
                    ) : (
                        <div
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            className="flex-grow overflow-y-auto p-4 pb-[144px]"
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
                            {(isLoadingMessages || isLoadingMongo) && <div className="text-center text-gray-500">Loading messages...</div>}
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
                                    onTopicOpen={() => setUserHasScrolledUp(true)}
                                    onTopicLoaded={() => {
                                        requestAnimationFrame(() => scrollToBottom("auto"));
                                    }}
                                />
                            )}
                        </div>
                    )}

                    {userHasScrolledUp && (
                        <Button
                            variant="secondary"
                            size="icon"
                            className="fixed right-4 h-10 w-10 rounded-full shadow-lg z-20" style={{ bottom: isMobile ? "132px" : "60px" }}
                            onClick={() => scrollToBottom("smooth")}
                        >
                            <IoArrowDown className="h-6 w-6" />
                        </Button>
                    )}

                    <div
                        className="fixed h-[50px]"
                        style={{
                            width: `${inputWidth}px`,
                            bottom: isMobile ? "72px" : "0px",
                            opacity: hideInput ? 0 : 1,
                        }}
                    >
                        <div className="flex h-[50px] items-end bg-[#fbfbfb] pb-1 pl-2 pr-2">
                            {isAnnouncementConversation ? (
                                <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                                    Replies are disabled for this system conversation.
                                </div>
                            ) : (
                                <div className="flex w-full items-end gap-1">
                                    {!isAnnouncementConversation && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-10 w-10 shrink-0 rounded-full text-gray-500 hover:bg-gray-200"
                                            onClick={() => setShowNewThreadModal(true)}
                                            disabled={false}
                                            title="New topic"
                                        >
                                            <HiLightBulb className="h-5 w-5" />
                                        </Button>
                                    )}
                                    <div className="flex-1">
                                        <ChatInput
                                            roomId={roomId}
                                            editingMessage={editingMessage}
                                            setEditingMessage={setEditingMessage}
                                            mentionCandidates={mentionCandidates}
                                            chatProvider={provider}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {isMobile && !inToolbox && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="fixed left-4 top-4 z-20 h-9 w-9 rounded-full bg-[#f1f1f1] hover:bg-[#cecece]"
                    onClick={() => router.push("/chat")}
                >
                    <IoArrowBack className="h-5 w-5" />
                </Button>
            )}
        {showNewThreadModal && roomId && (
            <NewThreadModal
                conversationId={roomId}
                onClose={() => setShowNewThreadModal(false)}
                onCreated={() => {}}
            />
        )}
        </>
    );
};
