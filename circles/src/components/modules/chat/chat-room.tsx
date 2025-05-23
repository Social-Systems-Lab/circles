//chat-room.tsx - chat room component, shows chat messages and input
"use client";

import { Dispatch, KeyboardEvent, SetStateAction, useCallback, useMemo, useTransition } from "react";
import { Circle, ChatMessage, MatrixUserCache, ChatRoomDisplay } from "@/models/models";
import { mapOpenAtom, matrixUserCacheAtom, roomMessagesAtom, userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { CirclePicture } from "../circles/circle-picture";
import RichText from "../feeds/RichText";
import { Mention, MentionsInput } from "react-mentions";
import { defaultMentionsInputStyle, defaultMentionStyle, handleMentionQuery } from "../feeds/post-list";
import { sendRoomMessage, sendReadReceipt } from "@/lib/data/client-matrix";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { fetchMatrixUsers } from "./actions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IoArrowBack, IoSend } from "react-icons/io5";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
import { useRouter } from "next/navigation";

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

// Renderer for different message types
export const MessageRenderer: React.FC<{ message: ChatMessage; preview?: boolean }> = ({ message, preview }) => {
    const displayName = message.author?.name || message.createdBy;
    switch (message.type) {
        case "m.room.message":
            return renderChatMessage(message, preview);

        case "m.room.member": {
            const membership = (message.content as { membership: string }).membership;
            const action = membership === "join" ? "has joined" : membership === "leave" ? "has left" : membership;
            return renderSystemMessage(`${displayName} ${action} the room.`);
        }

        case "m.room.name": {
            const name = (message.content as { name: string }).name;
            return renderSystemMessage(`Room name changed to "${name}" by ${displayName}.`);
        }

        case "m.room.topic": {
            const topic = (message.content as { topic: string }).topic;
            return renderSystemMessage(`Room topic updated to "${topic}" by ${displayName}.`);
        }

        case "m.room.history_visibility": {
            const visibility = (message.content as { history_visibility: string }).history_visibility;
            return renderSystemMessage(`Room history visibility set to "${visibility}".`);
        }

        case "m.room.join_rules": {
            const joinRule = (message.content as { join_rule: string }).join_rule;
            return renderSystemMessage(`Room join rule updated to "${joinRule}".`);
        }

        case "m.room.canonical_alias": {
            const alias = (message.content as { alias: string }).alias;
            return renderSystemMessage(`Room alias set to "${alias}".`);
        }

        case "m.room.power_levels": {
            const powerLevels = message.content as {
                users_default?: number;
                events_default?: number;
                state_default?: number;
            };
            return renderSystemMessage(
                `Room power levels updated. Default user level: ${powerLevels.users_default || 0}.`,
            );
        }

        case "m.room.create": {
            const creator = (message.content as { creator: string }).creator;
            return renderSystemMessage(`Room created by ${displayName}.`);
        }

        default:
            return renderSystemMessage(`Unknown event: ${message.type}`);
    }
};

const renderChatMessage = (message: ChatMessage, preview?: boolean) => {
    if (preview) {
        return (
            <span>
                <b>{message.author.name}: </b>
                {message?.content?.body as string}
            </span>
        );
    } else {
        return <RichText content={message?.content?.body as string} />;
    }
};

const renderSystemMessage = (content: string) => content;

type ChatMessagesProps = {
    messages: ChatMessage[];
    messagesEndRef?: React.RefObject<HTMLDivElement | null>;
    onMessagesRendered?: () => void;
};

const sameAuthor = (message1: ChatMessage, message2: ChatMessage) => {
    if (!message1?.author || !message2?.author) return false;
    if (message1.type !== "m.room.message" || message2.type !== "m.room.message") return false;
    return message1.author._id === message2.author._id;
};

const ChatMessages: React.FC<ChatMessagesProps> = ({ messages, messagesEndRef, onMessagesRendered }) => {
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

    const orderedMessages = [...messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

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
                        <div key={`date-${message.createdAt}`} className="my-2 text-center text-sm text-gray-500">
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
                        <div key={message.id} className={`mb-1 flex gap-4 ${isFirstInChain ? "mt-4" : "mt-1"}`}>
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

                            <div className={`flex flex-col`}>
                                <div className={`bg-white p-2 pr-4 shadow-md ${borderRadiusClass}`}>
                                    <MessageRenderer message={message} />
                                </div>
                                {isLastInChain && (
                                    <span className="mt-1 text-xs text-gray-500">
                                        {formatChatDate(new Date(message.createdAt))}
                                    </span>
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
    }, [latestMessage?.sender, matrixUserCache, setMatrixUserCache]);

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
    const isMobile = useIsMobile();

    const handleSendMessage = async () => {
        if (!user) return;
        if (newMessage.trim() !== "") {
            try {
                // console.log("Sending message:", chatRoom.matrixRoomId, newMessage);
                await sendRoomMessage(user.matrixAccessToken!, user.matrixUrl!, chatRoom.matrixRoomId!, newMessage);
                setNewMessage("");
            } catch (error) {
                console.error("Failed to send message:", error);
            }
        }
    };

    const handleCommentKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    return (
        <>
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
        </>
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
    const isCompact = useIsCompact();
    const [hideInput, setHideInput] = useState(false);
    const [inputWidth, setInputWidth] = useState<number | null>(null);
    const isMobile = useIsMobile();
    const [isLoadingMessages, startLoadingMessagesTransition] = useTransition();
    const inputRef = useRef<HTMLDivElement>(null);
    const [mapOpen] = useAtom(mapOpenAtom);
    const [user, setUser] = useAtom(userAtom);
    const [matrixUserCache, setMatrixUserCache] = useAtom(matrixUserCacheAtom);
    const [roomMessages] = useAtom(roomMessagesAtom);
    const router = useRouter();

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.ChatRoomComponent.1");
        }
    }, []);

    const markLatestMessageAsRead = useCallback(async () => {
        if (messages.length > 0 && user?.matrixAccessToken) {
            const latestMessage = messages[messages.length - 1];

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
            console.log(`💬 [Chat] Read receipt sent successfully`);
        } else {
            console.log(`💬 [Chat] No messages to mark as read for room ${chatRoom.name || chatRoom.matrixRoomId}`);
        }
    }, [chatRoom?.matrixRoomId, chatRoom?.name, messages, user?.matrixAccessToken, user?.matrixUrl]);

    const scrollToBottom = () => {
        // console.log("Scrolling to bottom");
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

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

    const handleMessagesRendered = () => {
        scrollToBottom();
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
                    {inToolbox ? (
                        <ScrollArea
                            className="p-4"
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
                                />
                            )}
                        </ScrollArea>
                    ) : (
                        <div className="flex-grow p-4 pb-[144px]">
                            {isLoadingMessages && <div className="text-center text-gray-500">Loading messages...</div>}
                            {!isLoadingMessages && (
                                <ChatMessages
                                    messages={messages}
                                    messagesEndRef={messagesEndRef}
                                    onMessagesRendered={handleMessagesRendered}
                                />
                            )}
                        </div>
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
                    className="fixed left-4 top-4 h-9 w-9 rounded-full bg-[#f1f1f1] hover:bg-[#cecece]"
                    onClick={() => router.push("/chat")}
                >
                    <IoArrowBack className="h-5 w-5" />
                </Button>
            )}
        </>
    );
};
