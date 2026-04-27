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
};

const sameAuthor = (message1: ChatMessage, message2: ChatMessage) => {
    if (!message1?.author || !message2?.author) return false;
    if (message1.type !== "m.room.message" || message2.type !== "m.room.message") return false;
    return message1.author._id === message2.author._id;
};

const ChatMessages: React.FC<ChatMessagesProps> = ({
    messages,
    messagesEndRef,
    onMessagesRendered,
    handleDelete,
    handleEdit,
    canReply = true,
    isDirect = false,
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
        const now = new Date();

        if (isSameDay(chatDate, now)) {
            return chatDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } else {
            return (
                chatDate.toLocaleDateString() +
                " " +
                chatDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            );
        }
    };

    const orderedMessages = [...messages]
        .filter(
            (message) =>
                message.type === "m.room.message" || message.type === "m.room.member" || message.type === "m.room.notice",
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
                const borderRadiusClass = `${isFirstInChain ? "rounded-t-lg" : ""} ${
                    isLastInChain ? "rounded-b-lg" : ""
                } ${!isFirstInChain && !isLastInChain ? "rounded-none" : ""}`;
                const selfIdentifier = user?.did;
                const isOwnMessage = message.createdBy === selfIdentifier;
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

                            <div className="relative flex min-w-[100px] max-w-[75%] flex-col overflow-hidden">
                                <div className={`${isOwnMessage ? "bg-blue-100" : "bg-white"} p-2 pr-4 shadow-md ${borderRadiusClass} ${bubbleStatusClasses}`}>
                                    {isFirstInChain && !isOwnMessage && !isDirect && (
                                        <div
                                            className="text-xs font-semibold"
                                            style={{ color: generateColorFromString(senderLabel || "") }}
                                        >
                                            {senderLabel}
                                        </div>
                                    )}
                                    <MessageRenderer message={message} />
                                    {message.reactions && Object.keys(message.reactions).length > 0 && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {Object.entries(message.reactions).map(([reaction, reactions]) => (
                                                <div
                                                    key={reaction}
                                                    className={`flex items-center rounded-full border bg-gray-100 px-2 py-0.5 text-xs ${
                                                        reactions.some((r) =>
                                                            r.sender === user?.did,
                                                        )
                                                            ? "border-blue-500"
                                                            : "border-gray-300"
                                                    }`}
                                                    onClick={() => handleReaction(message, reaction)}
                                                >
                                                    <span>{reaction}</span>
                                                    <span className="ml-1 text-gray-600">{reactions.length}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {isLastInChain && (
                                    <div className={`mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 ${isOwnMessage ? "justify-end" : "justify-start"}`}>
                                        <span>{formatChatDate(new Date(message.createdAt))}</span>
                                        {isOwnMessage && message.status === "pending" && (
                                            <span className="flex items-center gap-1 text-blue-500">
                                                <IoTimeOutline className="h-3 w-3" />
                                                Sending…
                                            </span>
                                        )}
                                        {isOwnMessage && message.status === "failed" && (
                                            <span className="flex items-center gap-1 text-red-500">
                                                <IoWarningOutline className="h-3 w-3" />
                                                {message.errorMessage || "Failed to send"}
                                            </span>
                                        )}
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
    const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);
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
                                />
                            )}
                        </div>
                    )}

                    {userHasScrolledUp && (
                        <Button
                            variant="secondary"
                            size="icon"
                            className="absolute bottom-20 right-4 h-10 w-10 rounded-full shadow-lg"
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
                                <ChatInput
                                    roomId={roomId}
                                    editingMessage={editingMessage}
                                    setEditingMessage={setEditingMessage}
                                    mentionCandidates={mentionCandidates}
                                    chatProvider={provider}
                                />
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
        </>
    );
};
