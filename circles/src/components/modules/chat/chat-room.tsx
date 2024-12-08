//chat-room.tsx
"use client";

import { Dispatch, KeyboardEvent, SetStateAction, useCallback, useMemo, useTransition } from "react";
import { Circle, ChatRoom, ChatMessage, Page, ChatRoomMembership, MatrixUserCache } from "@/models/models";
import CircleHeader from "../circles/circle-header";
import { mapOpenAtom, matrixUserCacheAtom, triggerMapOpenAtom, userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { CirclePicture } from "../circles/circle-picture";
import RichText from "../feeds/RichText";
import { Mention, MentionsInput } from "react-mentions";
import { defaultMentionsInputStyle, defaultMentionStyle, handleMentionQuery } from "../feeds/post-list";
import { fetchRoomMessages, sendRoomMessage, startSync } from "@/lib/data/client-matrix";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { fetchMatrixUsers, joinChatRoomAction } from "./actions";
import { ScrollArea } from "@/components/ui/scroll-area";

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

// Utility for same-day message grouping
const isSameDay = (date1: Date, date2: Date) => {
    return (
        date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate()
    );
};

// Renderer for different message types
const MessageRenderer: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const displayName = message.author?.name || message.createdBy;
    switch (message.type) {
        case "m.room.message":
            return renderChatMessage(message);

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

const renderChatMessage = (message: ChatMessage) => <RichText content={message.content.body} />;

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

type ChatInputProps = {
    setMessages: any;
    circle: Circle;
    chatRoom: ChatRoom;
    page?: Page;
    subpage?: string;
};

const ChatInput = ({ setMessages, circle, chatRoom, page, subpage }: ChatInputProps) => {
    const [user] = useAtom(userAtom);
    const [newMessage, setNewMessage] = useState("");
    const isMobile = useIsMobile();

    const handleSendMessage = async () => {
        if (!user) return;
        if (newMessage.trim() !== "") {
            try {
                console.log("Sending message:", chatRoom.matrixRoomId, newMessage);
                await sendRoomMessage(user.matrixAccessToken!, chatRoom.matrixRoomId!, newMessage);
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
                <button onClick={handleSendMessage} className="mt-1 text-blue-500">
                    Send
                </button>
            )}
        </>
    );
};

const fetchAndCacheMatrixUsers = async (
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
    chatRoom: ChatRoom;
    circle: Circle;
    inToolbox?: boolean;
    isDefaultCircle?: boolean;
    page: Page;
    subpage?: string;
}> = ({ chatRoom, circle, inToolbox, page, subpage, isDefaultCircle }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const isCompact = useIsCompact();
    const [hideInput, setHideInput] = useState(false);
    const [inputWidth, setInputWidth] = useState<number | null>(null);
    const isMobile = useIsMobile();
    const [isPending, startTransition] = useTransition();
    const [isLoadingMessages, startLoadingMessagesTransition] = useTransition();
    const inputRef = useRef<HTMLDivElement>(null);
    const [mapOpen] = useAtom(mapOpenAtom);
    const [triggerMapOpen] = useAtom(triggerMapOpenAtom);
    const { toast } = useToast();
    const [user, setUser] = useAtom(userAtom);
    const [matrixUserCache, setMatrixUserCache] = useAtom(matrixUserCacheAtom);
    const hasJoinedChat = useMemo(() => {
        return user?.chatRoomMemberships?.some((membership) => membership.chatRoomId === chatRoom._id);
    }, [user?.chatRoomMemberships, chatRoom._id]);
    const initialMessagesLoaded = useRef(false);

    const scrollToBottom = () => {
        console.log("Scrolling to bottom");
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const loadInitialMessages = useCallback(async () => {
        if (!chatRoom?.matrixRoomId || initialMessagesLoaded.current) return;
        initialMessagesLoaded.current = true; // Mark as loaded

        startLoadingMessagesTransition(async () => {
            try {
                const { messages } = await fetchRoomMessages(user?.matrixAccessToken!, chatRoom.matrixRoomId!, 20);

                // Fetch and cache user details
                const matrixUsernames = messages.map((msg) => msg.sender);
                let userCache = await fetchAndCacheMatrixUsers(matrixUsernames, matrixUserCache, setMatrixUserCache);

                const formattedMessages = messages.map((msg: any, index: number) => {
                    const author = userCache[msg.sender] || {
                        _id: msg.sender,
                        name: msg.sender,
                        picture: { url: "/placeholder.svg" },
                    };
                    return {
                        id: msg.event_id,
                        chatRoomId: msg.room_id,
                        createdBy: msg.sender,
                        createdAt: new Date(msg.origin_server_ts),
                        content: msg.content,
                        type: msg.type,
                        stateKey: msg.state_key,
                        unsigned: msg.unsigned,
                        author, // Your database user data
                    } as ChatMessage;
                });

                setMessages(formattedMessages);
            } catch (error) {
                console.error("Failed to fetch chat messages:", error);
            }
        });
    }, [chatRoom.matrixRoomId, matrixUserCache, setMatrixUserCache, user?.matrixAccessToken]);

    const messagesRef = useRef<ChatMessage[]>([]);
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        if (!chatRoom?.matrixRoomId || !user?.matrixAccessToken) return;

        const handleNewEvents = async (data: any) => {
            const roomEvents = data.rooms?.join?.[chatRoom.matrixRoomId!]?.timeline?.events || [];

            const newUsernames = roomEvents
                .filter((event: any) => event.type === "m.room.message")
                .map((event: any) => event.sender)
                .filter((username: string) => !matrixUserCache[username]); // Only fetch uncached users

            // Fetch and update the cache for any new usernames
            const updatedCache = await fetchAndCacheMatrixUsers(newUsernames, matrixUserCache, setMatrixUserCache);

            const newMessages = roomEvents
                .filter(
                    (event: any) =>
                        event.type === "m.room.message" &&
                        !messagesRef.current.some((msg) => msg.id === event.event_id), // Deduplicate using latest state
                )
                .map((msg: any) => ({
                    id: msg.event_id,
                    chatRoomId: chatRoom.matrixRoomId,
                    createdBy: msg.sender,
                    createdAt: new Date(msg.origin_server_ts),
                    content: msg.content,
                    type: msg.type,
                    stateKey: msg.state_key,
                    unsigned: msg.unsigned,
                    author: updatedCache[msg.sender] || { name: msg.sender },
                }));

            console.log("Handling new events", JSON.stringify(matrixUserCache));
            const matrixUsernames = roomEvents.map((msg: any) => msg.sender);
            console.log("New messages from", JSON.stringify(matrixUsernames));

            setMessages((prevMessages) => [...prevMessages, ...newMessages]);
        };

        startSync(user.matrixAccessToken, handleNewEvents);

        return () => {
            // Cleanup if necessary
        };
    }, [chatRoom.matrixRoomId, user?.matrixAccessToken, matrixUserCache, setMatrixUserCache]);

    useEffect(() => {
        // if user isn't in the chat room don't load messages
        if (!hasJoinedChat) return;
        loadInitialMessages();
    }, [circle._id, hasJoinedChat, loadInitialMessages]);

    useEffect(() => {
        console.log("UseEffect called");
        const updateInputWidth = () => {
            if (inputRef.current) {
                console.log("Updating input width" + inputRef.current.clientWidth);
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

    const handleJoinChat = async () => {
        startTransition(async () => {
            if (!user) return;

            try {
                const result = await joinChatRoomAction(chatRoom._id);
                if (result.success) {
                    // Update the user state to include the new chat room membership
                    const newMembership: ChatRoomMembership = {
                        _id: result.chatRoomMember?._id,
                        userDid: user?.did!,
                        chatRoomId: chatRoom._id,
                        circleId: circle._id,
                        joinedAt: new Date(),
                        chatRoom: chatRoom,
                    };
                    const updatedUser = {
                        ...user,
                        chatRoomMemberships: [...(user.chatRoomMemberships || []), newMembership],
                    };
                    setUser(updatedUser);

                    toast({
                        title: "Joined chat",
                        variant: "success",
                    });
                } else {
                    console.error(result.message);
                    toast({
                        title: result.message,
                        variant: "destructive",
                    });
                }
            } catch (error) {
                console.error("Failed to join chat room:", error);
            }
        });
    };

    return (
        <div
            className={`flex h-full flex-1 items-start justify-center ${inToolbox ? "bg-[#fbfbfb]" : "min-h-screen"}`}
            style={{
                flexGrow: isCompact || inToolbox ? "1" : "3",
                maxWidth: isCompact || inToolbox ? "none" : "700px",
            }}
        >
            <div ref={inputRef} className="relative flex h-full w-full flex-col">
                {!inToolbox && (
                    <div className="mt-4">
                        <CircleHeader
                            circle={circle}
                            page={page}
                            subpage={chatRoom.handle && chatRoom.handle !== "default" ? chatRoom.name : undefined}
                            isDefaultCircle={isDefaultCircle}
                        />
                    </div>
                )}

                {/* Dot Menu */}
                {/* {hasJoinedChat && (
                    <div className="absolute right-4 top-4">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                                <DropdownMenuItem onClick={handleLeaveChat}>Leave Chat</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )} */}

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

                {!hasJoinedChat ? (
                    <div
                        className="fixed flex h-[72px] items-center justify-center bg-[#fbfbfb]"
                        style={{
                            width: `${inputWidth}px`,
                            bottom: isMobile ? "72px" : "0px",
                        }}
                    >
                        <Button
                            onClick={handleJoinChat}
                            className="rounded-[50px] bg-primaryLight px-4 py-2 text-white"
                            disabled={isPending}
                        >
                            {isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Joining...
                                </>
                            ) : (
                                <>Join Chat</>
                            )}
                        </Button>
                    </div>
                ) : (
                    <div
                        className="fixed h-[50px]"
                        style={{
                            width: `${inputWidth}px`,
                            bottom: isMobile ? "72px" : "0px",
                            opacity: hideInput ? 0 : 1,
                        }}
                    >
                        <div className="flex h-[50px] items-end bg-[#fbfbfb] pb-1 pl-2 pr-2">
                            <ChatInput
                                setMessages={setMessages}
                                circle={circle}
                                chatRoom={chatRoom}
                                page={page}
                                subpage={subpage}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
