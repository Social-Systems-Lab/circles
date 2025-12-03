//chat-room.tsx - chat room component, shows chat messages and input
"use client";

import { Dispatch, KeyboardEvent, SetStateAction, useCallback, useMemo, useTransition } from "react";
import { Circle, ChatMessage, MatrixUserCache, ChatRoomDisplay, ReactionAggregation } from "@/models/models";
import { mapOpenAtom, matrixUserCacheAtom, replyToMessageAtom, roomMessagesAtom, userAtom, unreadCountsAtom, lastReadTimestampsAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { CirclePicture } from "../circles/circle-picture";
import RichText from "../feeds/RichText";
import { Mention, MentionsInput } from "react-mentions";
import { defaultMentionsInputStyle, defaultMentionStyle, handleMentionQuery } from "../feeds/post-list";
import { sendRoomMessage, sendReadReceipt, redactRoomMessage, sendReaction } from "@/lib/data/client-matrix";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { fetchMatrixUsers } from "./actions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IoArrowBack, IoClose, IoSend, IoTrashOutline, IoAddCircleOutline, IoArrowDown, IoAttach, IoDocumentText } from "react-icons/io5";
import { MdReply } from "react-icons/md";
import { BsEmojiSmile } from "react-icons/bs";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generateColorFromString } from "@/lib/utils/color";
import { EmojiClickData } from "emoji-picker-react";
import LazyEmojiPicker from "./LazyEmojiPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

const renderChatMessage = (message: ChatMessage, preview?: boolean) => {
    if (preview) {
        return (
            <span>
                <b>{message.author.name}: </b>
                {message?.content?.body as string}
            </span>
        );
    } else {
        const body = (message?.content?.body as string) || "";
        const isReply = body.includes("\n\n") && body.startsWith("> ");
        const replyText = isReply ? body.substring(body.indexOf("\n\n") + 2) : body;
        const originalMessage = isReply ? body.substring(body.indexOf("> ") + 2, body.indexOf("\n\n")) : "";
        const originalAuthor = isReply ? originalMessage.substring(1, originalMessage.indexOf(">")) : "";
        const originalAuthorColor = generateColorFromString(originalAuthor);

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
                            {originalMessage.substring(originalMessage.indexOf(">") + 2)}
                        </p>
                    </div>
                )}
                <RichText content={replyText} />
            </div>
        );
    }
};

// Renderer for different message types
export const MessageRenderer: React.FC<{ message: ChatMessage; preview?: boolean }> = ({ message, preview }) => {
    const [user] = useAtom(userAtom);
    const displayName = message.author?.name || message.createdBy;
    switch (message.type) {
        case "m.room.message":
            if (!Object.keys(message.content).length) {
                return <span className="italic text-gray-500">Message deleted</span>;
            }
            const msgtype = (message.content as any).msgtype;
            if (msgtype === "m.image") {
                const mxcUrl = (message.content as any).url;
                if (mxcUrl && typeof mxcUrl === "string") {
                     // Convert MXC URI to HTTP URL using authenticated endpoint
                     // Format: mxc://<server-name>/<media-id> -> http://localhost/_matrix/client/v1/media/download/<server-name>/<media-id>?access_token=...
                     const mediaId = mxcUrl.replace("mxc://", "");
                     // Construct URL - use port 80 for localhost to go through nginx
                     const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https' : 'http';
                     const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
                     const port = hostname === 'localhost' ? ':80' : '';
                     const accessToken = user?.matrixAccessToken || '';
                     const imageUrl = `${protocol}://${hostname}${port}/_matrix/client/v1/media/download/${mediaId}?access_token=${encodeURIComponent(accessToken)}`;
                     
                     console.log(`🖼️ [Chat] Image URL: ${imageUrl.replace(accessToken, 'REDACTED')} (MediaID: ${mediaId})`);
                     
                     return (
                         <div className="max-w-xs sm:max-w-sm">
                             {/* eslint-disable-next-line @next/next/no-img-element */}
                             <img 
                                 src={imageUrl} 
                                 alt={(message.content as any).body || "Image attachment"} 
                                 className="rounded-lg object-contain max-h-60 w-full cursor-pointer hover:opacity-90"
                                 onClick={() => window.open(imageUrl, "_blank")}
                             />
                         </div>
                     );
                }
            } else if (msgtype === "m.file") {
                const mxcUrl = (message.content as any).url;
                if (mxcUrl && typeof mxcUrl === "string") {
                     const mediaId = mxcUrl.replace("mxc://", "");
                     const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https' : 'http';
                     const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
                     const port = hostname === 'localhost' ? ':80' : '';
                     const accessToken = user?.matrixAccessToken || '';
                     const fileUrl = `${protocol}://${hostname}${port}/_matrix/client/v1/media/download/${mediaId}?access_token=${encodeURIComponent(accessToken)}`;
                     const fileName = (message.content as any).body || "File attachment";
                     const fileSize = (message.content as any).info?.size;
                     
                     return (
                         <a 
                             href={fileUrl} 
                             target="_blank" 
                             rel="noopener noreferrer"
                             className="flex items-center gap-2 rounded-lg bg-gray-100 p-3 hover:bg-gray-200 transition-colors"
                         >
                             <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                                 <IoDocumentText className="h-6 w-6" />
                             </div>
                             <div className="flex flex-col overflow-hidden">
                                 <span className="truncate font-medium text-gray-700">{fileName}</span>
                                 {fileSize && (
                                     <span className="text-xs text-gray-500">
                                         {(fileSize / 1024).toFixed(1)} KB
                                     </span>
                                 )}
                             </div>
                         </a>
                     );
                }
            }
            
            return renderChatMessage(message, preview);

        case "m.room.member": {
            const membership = (message.content as { membership: string }).membership;
            const action = membership === "join" ? "has joined" : membership === "leave" ? "has left" : membership;
            return renderSystemMessage(`${displayName} ${action} the room.`);
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
};

const sameAuthor = (message1: ChatMessage, message2: ChatMessage) => {
    if (!message1?.author || !message2?.author) return false;
    if (message1.type !== "m.room.message" || message2.type !== "m.room.message") return false;
    return message1.author._id === message2.author._id;
};

const ChatMessages: React.FC<ChatMessagesProps> = ({ messages, messagesEndRef, onMessagesRendered, handleDelete }) => {
    const [user] = useAtom(userAtom);
    const [, setReplyToMessage] = useAtom(replyToMessageAtom);
    const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
    const [pickerOpenForMessage, setPickerOpenForMessage] = useState<string | null>(null);
    const [, setRoomMessages] = useAtom(roomMessagesAtom);
    const isMobile = useIsMobile();

    const handleReply = (message: ChatMessage) => {
        setReplyToMessage(message);
    };

    const longPressTimer = useRef<NodeJS.Timeout | null>(null);

    const handleReaction = async (message: ChatMessage, emoji: string) => {
        if (!user?.matrixAccessToken || !user?.matrixUrl || !user.fullMatrixName) return;

        const anyExistingReaction = Object.entries(message.reactions || {})
            .map(([key, reactions]) => {
                const userReaction = reactions.find((r) => r.sender === user.fullMatrixName);
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
                    (r) => r.sender !== user.fullMatrixName,
                );
                if (reactions[anyExistingReaction.key].length === 0) {
                    delete reactions[anyExistingReaction.key];
                }
            }

            // Add the new reaction, unless it was the same as the one removed
            if (!anyExistingReaction || anyExistingReaction.key !== emoji) {
                const newReaction: ReactionAggregation = {
                    sender: user.fullMatrixName!,
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
            // If there was an old reaction, redact it first
            if (anyExistingReaction) {
                await redactRoomMessage(
                    user.matrixAccessToken,
                    user.matrixUrl,
                    message.roomId,
                    anyExistingReaction.eventId,
                );
            }
            // If the new reaction is different from the old one, send it
            if (!anyExistingReaction || anyExistingReaction.key !== emoji) {
                await sendReaction(user.matrixAccessToken, user.matrixUrl, message.roomId, message.id, emoji);
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
        .filter((message) => message.type === "m.room.message" || message.type === "m.room.member")
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
                            className={`group relative mb-1 flex gap-4 ${isFirstInChain ? "mt-4" : "mt-1"} ${hoveredMessageId === message.id ? "z-10" : ""}`}
                            onMouseEnter={() => !isMobile && setHoveredMessageId(message.id)}
                            onMouseLeave={() => !isMobile && setHoveredMessageId(null)}
                            onTouchStart={() => handleTouchStart(message)}
                            onTouchEnd={handleTouchEnd}
                        >
                            {isFirstInChain ? (
                                <CirclePicture
                                    circle={message.author!}
                                    size="40px"
                                    className="pt-2"
                                    openPreview={true}
                                />
                            ) : (
                                <div className="h-10 w-10 flex-shrink-0"></div>
                            )}

                            <div className="relative flex min-w-[100px] max-w-full flex-col overflow-hidden">
                                <div className={`bg-white p-2 pr-4 shadow-md ${borderRadiusClass}`}>
                                    {isFirstInChain && (
                                        <div
                                            className="text-xs font-semibold"
                                            style={{ color: generateColorFromString(message.author.name || "") }}
                                        >
                                            {message.author.name}
                                        </div>
                                    )}
                                    <MessageRenderer message={message} />
                                    {message.reactions && Object.keys(message.reactions).length > 0 && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {Object.entries(message.reactions).map(([reaction, reactions]) => (
                                                <div
                                                    key={reaction}
                                                    className={`flex items-center rounded-full border bg-gray-100 px-2 py-0.5 text-xs ${
                                                        reactions.some((r) => r.sender === user?.fullMatrixName)
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
                                    <span className="mt-1 text-xs text-gray-500">
                                        {formatChatDate(new Date(message.createdAt))}
                                    </span>
                                )}

                                {(hoveredMessageId === message.id || pickerOpenForMessage === message.id) && (
                                    <div className="absolute bottom-1 right-0 z-10 flex items-center gap-0.5 rounded-full border border-gray-200 bg-white p-0.5 shadow-sm">
                                        {user?.fullMatrixName === message.createdBy && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6"
                                                onClick={() => handleDelete(message)}
                                            >
                                                <IoTrashOutline className="h-4 w-4" />
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => handleReply(message)}
                                        >
                                            <MdReply className="h-4 w-4" />
                                        </Button>
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
    const [matrixUserCache, setMatrixUserCache] = useAtom(matrixUserCacheAtom);
    const latestMessage = useMemo(() => {
        const matchingEntry = Object.entries(latestMessages).find(([key]) => key.startsWith(roomId));
        if (!matchingEntry) {
            return null;
        }
        // console.log(JSON.stringify(matchingEntry[1], null, 2));
        return matchingEntry[1];
    }, [latestMessages, roomId]);

    const latestSender = useMemo(async () => {
        let sender = latestMessage?.sender;
        if (!sender) return null;

        if (!matrixUserCache[sender]) {
            console.log("Fetching matrix users");
            // console.log(JSON.stringify(matrixUserCache, null, 2));
            //await fetchAndCacheMatrixUsers([sender], matrixUserCache, setMatrixUserCache);
        }

        return (
            matrixUserCache[sender] || {
                _id: sender,
                name: sender,
                picture: { url: "/placeholder.svg" },
            }
        );
    }, [latestMessage?.sender, matrixUserCache]);

    const formattedMessage = useMemo(() => {
        return {
            ...latestMessage,
            author: latestSender,
        } as ChatMessage;
    }, [latestMessage, latestSender]);

    if (!formattedMessage) {
        return <span>No messages yet</span>;
    }

    return <span>{formattedMessage?.content?.body as string}</span>;

    // <MessageRenderer message={formattedMessage} preview={true} />;
};

type ChatInputProps = {
    chatRoom: ChatRoomDisplay;
};

const ChatInput = ({ chatRoom }: ChatInputProps) => {
    const [user] = useAtom(userAtom);
    const [newMessage, setNewMessage] = useState("");
    const [replyToMessage, setReplyToMessage] = useAtom(replyToMessageAtom);
    const isMobile = useIsMobile();

    const handleSendMessage = async () => {
        if (!user) return;
        
        if (!user.matrixAccessToken) {
            console.error("Missing Matrix credentials. User needs to log out and log back in to trigger Matrix registration.");
            return;
        }
        
        if (!chatRoom.matrixRoomId) {
            console.error("Chat room does not have a Matrix room ID");
            return;
        }
        
        if (newMessage.trim() !== "") {
            try {
                // Use server action to send message (avoids CORS issues)
                const { sendMessageAction } = await import("./actions");
                const result = await sendMessageAction(
                    chatRoom.matrixRoomId,
                    newMessage,
                    replyToMessage?.id
                );
                
                if (result.success) {
                    setNewMessage("");
                    setReplyToMessage(null);
                } else {
                    console.error("Failed to send message:", result.message);
                }
            } catch (error) {
                console.error("Failed to send message:", error);
            }
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
        
        if (!chatRoom.matrixRoomId) {
            console.error("Chat room does not have a Matrix room ID");
            return;
        }

        // Check size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert("File size exceeds 5MB limit.");
            return;
        }

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append("roomId", chatRoom.matrixRoomId);
            formData.append("file", file);
            if (replyToMessage) {
                formData.append("replyToEventId", replyToMessage.id);
            }

            const { sendAttachmentAction } = await import("./actions");
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
            handleSendMessage();
        }
    };

    return (
        <div className="flex w-full flex-col">
            {replyToMessage && (
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
                    placeholder="Type a message..."
                    className="flex-grow rounded-[20px] bg-gray-100"
                    style={{
                        ...defaultMentionsInputStyle,
                        suggestions: {
                            position: "absolute",
                            bottom: "100%",
                            marginBottom: "10px",
                        },
                    }}
                >
                    <Mention
                        trigger="@"
                        data={handleMentionQuery}
                        style={defaultMentionStyle}
                        displayTransform={(id, display) => `${display}`}
                        renderSuggestion={renderCircleSuggestion}
                        markup="[__display__](/circles/__id__)"
                    />
                </MentionsInput>
                {isMobile && (
                    <Button onClick={handleSendMessage} className="ml-2 rounded-full text-white">
                        <IoSend />
                    </Button>
                )}
            </div>
        </div>
    );
};

export const fetchAndCacheMatrixUsers = async (
    matrixUsernames: string[],
    matrixUserCache: MatrixUserCache,
    setMatrixUserCache: Dispatch<SetStateAction<MatrixUserCache>>,
): Promise<MatrixUserCache> => {
    // Deduplicate usernames
    const uniqueUsernames = Array.from(new Set(matrixUsernames));
    const uncachedUsernames = uniqueUsernames.filter((username) => !matrixUserCache[username]);

    if (uncachedUsernames.length === 0) {
        return matrixUserCache; // Nothing to fetch
    }

    try {
        const userData: (Circle | null)[] = await fetchMatrixUsers(uncachedUsernames);

        // Update cache with fetched users
        const updatedCache = {
            ...matrixUserCache,
            ...userData.reduce((acc, user, index) => {
                const matrixUsername = uncachedUsernames[index];
                if (user) {
                    acc[matrixUsername] = user;
                }
                return acc;
            }, {} as MatrixUserCache),
        };

        setMatrixUserCache(updatedCache);
        return updatedCache;
    } catch (error) {
        console.error("Failed to fetch Matrix users:", error);
        return matrixUserCache; // Return the current cache even on failure
    }
};

export const ChatRoomComponent: React.FC<{
    chatRoom: ChatRoomDisplay;
    setSelectedChat?: Dispatch<SetStateAction<ChatRoomDisplay | undefined>>;
    circle: Circle;
    inToolbox?: boolean;
}> = ({ chatRoom, setSelectedChat, circle, inToolbox }) => {
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
    const [user, setUser] = useAtom(userAtom);
    const [matrixUserCache, setMatrixUserCache] = useAtom(matrixUserCacheAtom);
    const [roomMessages, setRoomMessages] = useAtom(roomMessagesAtom);
    const [unreadCounts, setUnreadCounts] = useAtom(unreadCountsAtom);
    const [lastReadTimestamps, setLastReadTimestamps] = useAtom(lastReadTimestampsAtom);
    const router = useRouter();

    const handleDelete = async (message: ChatMessage) => {
        if (window.confirm("Are you sure you want to delete this message?")) {
            // Optimistic UI update
            setRoomMessages((prev) => {
                const newRoomMessages = { ...prev };
                const currentRoomMessages = newRoomMessages[message.roomId] || [];
                newRoomMessages[message.roomId] = currentRoomMessages.filter((m) => m.id !== message.id);
                return newRoomMessages;
            });

            if (!user?.matrixAccessToken || !user?.matrixUrl) return;
            try {
                await redactRoomMessage(user.matrixAccessToken, user.matrixUrl, message.roomId, message.id);
            } catch (error) {
                console.error("Failed to delete message:", error);
                // Revert UI update on failure by re-fetching or relying on sync
                // For simplicity, we'll let the next sync correct the state
            }
        }
    };

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.ChatRoomComponent.1");
        }

        const markPmsAsRead = async () => {
            try {
                await fetch("/api/notifications/mark-pms-as-read", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ roomId: chatRoom.matrixRoomId }),
                });
            } catch (error) {
                console.error("Error marking PMs as read:", error);
            }
        };

        if (chatRoom.matrixRoomId) {
            markPmsAsRead();
        }
    }, [chatRoom.matrixRoomId]);

    const lastReadMessageIdRef = useRef<string | null>(null);

    const markLatestMessageAsRead = useCallback(async () => {
        if (messages.length > 0 && user?.matrixAccessToken) {
            const latestMessage = messages[messages.length - 1];

            // Prevent infinite loop - only mark as read if it's a new message
            if (lastReadMessageIdRef.current === latestMessage.id) {
                return;
            }

            console.log(`💬 [Chat] Marking latest message as read in room ${chatRoom.name}:`);
            console.log(`💬 [Chat] - Room ID: ${latestMessage.roomId}`);
            console.log(`💬 [Chat] - Message ID: ${latestMessage.id}`);
            console.log(`💬 [Chat] - Time: ${new Date(latestMessage.createdAt).toISOString()}`);
            console.log(`💬 [Chat] - From: ${latestMessage.createdBy}`);

            if (latestMessage.type === "m.room.message") {
                const contentPreview =
                    typeof latestMessage.content?.body === "string"
                        ? JSON.stringify(latestMessage.content?.body).substring(0, 50)
                        : "N/A";
                console.log(`💬 [Chat] - Content: ${contentPreview}...`);
            }

            await sendReadReceipt(user.matrixAccessToken, user.matrixUrl!, latestMessage.roomId, latestMessage.id);
            lastReadMessageIdRef.current = latestMessage.id;
            
            // Update last read timestamp for this room
            const messageTimestamp = latestMessage.createdAt instanceof Date 
                ? latestMessage.createdAt.getTime() 
                : new Date(latestMessage.createdAt).getTime();
                
            if (chatRoom.matrixRoomId) {
                setLastReadTimestamps((prev) => ({
                    ...prev,
                    [chatRoom.matrixRoomId!]: messageTimestamp
                }));
                
                console.log(`💬 [Chat] Updated last read timestamp for room ${chatRoom.matrixRoomId} to ${new Date(messageTimestamp).toISOString()}`);
            }
            
            // Clear unread count for this room
            if (chatRoom.matrixRoomId) {
                setUnreadCounts((prev) => {
                    const newCounts = { ...prev };
                    // Clear all entries for this room (handles both with and without user ID suffix)
                    Object.keys(newCounts).forEach(key => {
                        if (key.startsWith(chatRoom.matrixRoomId!)) {
                            delete newCounts[key];
                        }
                    });
                    return newCounts;
                });
            }
            
            console.log(`💬 [Chat] Read receipt sent successfully`);
        } else {
            console.log(`💬 [Chat] No messages to mark as read for room ${chatRoom.name || chatRoom.matrixRoomId}`);
        }
    }, [chatRoom?.matrixRoomId, chatRoom?.name, messages, user?.matrixAccessToken, user?.matrixUrl, setUnreadCounts, setLastReadTimestamps]);

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
        const roomId = chatRoom.matrixRoomId!;
        const roomMessagesForChat = roomMessages[roomId] || [];
        setMessages(roomMessagesForChat);
    }, [chatRoom.matrixRoomId, roomMessages, matrixUserCache]);

    const messagesRef = useRef<ChatMessage[]>([]);
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        markLatestMessageAsRead(); // Mark the latest message as read when messages update
    }, [messages, markLatestMessageAsRead]);

    // Server-side message polling - DISABLED: Now handled by BackgroundMessagePoller globally
    /*
    useEffect(() => {
        if (!chatRoom.matrixRoomId) return;

        let intervalId: NodeJS.Timeout;
        let lastMessageCount = 0;
        
        const pollMessages = async () => {
            try {
                const { fetchRoomMessagesAction } = await import("./actions");
                const result = await fetchRoomMessagesAction(chatRoom.matrixRoomId!, 50);
                
                if (result.success && result.messages) {
                    // Only process if message count changed
                    if (result.messages.length === lastMessageCount) {
                        return;
                    }
                    
                    lastMessageCount = result.messages.length;
                    
                    // Convert Matrix messages to ChatMessage format and update roomMessages
                    const formattedMessages: ChatMessage[] = await Promise.all(
                        result.messages
                            .filter((msg: any) => msg.type === "m.room.message")
                            .map(async (msg: any) => {
                                // Get or cache user info
                                let author = matrixUserCache[msg.sender];
                                if (!author) {
                                    const users = await fetchMatrixUsers([msg.sender]);
                                    author = users[0];
                                    if (author) {
                                        setMatrixUserCache((prev) => ({ ...prev, [msg.sender]: author }));
                                    }
                                }

                                return {
                                    id: msg.event_id,
                                    roomId: chatRoom.matrixRoomId!,
                                    type: msg.type,
                                    content: msg.content,
                                    createdBy: msg.sender,
                                    createdAt: new Date(msg.origin_server_ts),
                                    author: author || undefined,
                                    reactions: {},
                                } as ChatMessage;
                            })
                    );

                    // Update room messages if we have new messages
                    if (formattedMessages.length > 0) {
                        setRoomMessages((prev) => ({
                            ...prev,
                            [chatRoom.matrixRoomId!]: formattedMessages.reverse(),
                        }));
                    }
                }
            } catch (error) {
                console.error("Failed to poll messages:", error);
            }
        };

        // Initial fetch
        pollMessages();

        // Poll every 3 seconds
        intervalId = setInterval(pollMessages, 3000);

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [chatRoom.matrixRoomId, matrixUserCache, setMatrixUserCache, setRoomMessages]);
    */


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
                    {!inToolbox && (
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
                            {isLoadingMessages && <div className="text-center text-gray-500">Loading messages...</div>}
                            {!isLoadingMessages && (
                                <ChatMessages
                                    messages={messages}
                                    messagesEndRef={messagesEndRef}
                                    onMessagesRendered={handleMessagesRendered}
                                    handleDelete={handleDelete}
                                />
                            )}
                        </div>
                    ) : (
                        <div
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            className="flex-grow overflow-y-auto p-4 pb-[144px]"
                        >
                            {isLoadingMessages && <div className="text-center text-gray-500">Loading messages...</div>}
                            {!isLoadingMessages && (
                                <ChatMessages
                                    messages={messages}
                                    messagesEndRef={messagesEndRef}
                                    onMessagesRendered={handleMessagesRendered}
                                    handleDelete={handleDelete}
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
                            <ChatInput chatRoom={chatRoom} />
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
