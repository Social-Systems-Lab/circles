"use client";

import { KeyboardEvent } from "react";
import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle, ChatRoom, Page, ChatMessageDisplay } from "@/models/models";
import CircleHeader from "../circles/circle-header";
import { mapOpenAtom, triggerMapOpenAtom, userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { getDateLong } from "@/lib/utils";
import { CirclePicture } from "../circles/circle-picture";
import RichText from "../feeds/RichText";
import { Mention, MentionsInput } from "react-mentions";
import { defaultMentionsInputStyle, defaultMentionStyle, handleMentionQuery } from "../feeds/post-list";
import { createChatMessageAction } from "./actions";

export const renderCircleSuggestion = (
    suggestion: any,
    search: string,
    highlightedDisplay: React.ReactNode,
    index: number,
    focused: boolean,
) => (
    <div className="flex items-center p-2">
        <img
            src={suggestion.picture || "/default-profile.png"}
            alt={suggestion.display}
            className="mr-2 h-6 w-6 rounded-full"
        />
        <span>{highlightedDisplay}</span>
    </div>
);

type ChatInputProps = {
    setMessages: any;
    circle: Circle;
    chatRoom: ChatRoom;
    page: Page;
    subpage?: string;
};

const ChatInput = ({ setMessages, circle, chatRoom, page, subpage }: ChatInputProps) => {
    const [user] = useAtom(userAtom);
    const [newMessage, setNewMessage] = useState("");
    const isMobile = useIsMobile();

    const handleSendMessage = async () => {
        if (!user) return;
        if (newMessage.trim() !== "") {
            const now = new Date();

            // Create form data to send to the backend
            const formData = new FormData();
            formData.append("content", newMessage);
            formData.append("circleId", circle._id);
            formData.append("chatRoomId", chatRoom._id);

            // Send the message to the backend
            const result = await createChatMessageAction(formData, page, subpage);

            if (result.success && result.chatMessage) {
                // Update the messages state with the new message
                setMessages((prevMessages: any) => [...prevMessages, result.chatMessage]);
                setNewMessage("");
            } else {
                console.error("Failed to send message: ", result.message);
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

export type ChatMessagesProps = {
    messages: ChatMessageDisplay[];
    chatRoom: ChatRoom;
    circle: Circle;
    page: Page;
    subpage?: string;
};

export const ChatMessages = ({ messages, chatRoom, circle, page, subpage }: ChatMessagesProps) => {
    const isSameDay = (date1: Date, date2: Date) => {
        return (
            date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate()
        );
    };

    const formatChatDate = (chatDate: Date) => {
        const now = new Date();

        if (isSameDay(chatDate, now)) {
            // If the date is today, print only the time in HH:MM format
            return chatDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } else {
            // Otherwise, print date and time in MM/DD/YYYY HH:MM format
            return (
                chatDate.toLocaleDateString() +
                " " +
                chatDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            );
        }
    };

    return (
        <div>
            {messages.reduce((acc: React.ReactNode[], message, index) => {
                const isNewDate = index === 0 || !isSameDay(message.createdAt, messages[index - 1].createdAt);
                const isNewAuthor = index === 0 || message.author.did !== messages[index - 1].author.did;
                const isFirstInChain = isNewDate || isNewAuthor;
                const isLastInChain =
                    index === messages.length - 1 ||
                    message.author.did !== messages[index + 1].author.did ||
                    !isSameDay(messages[index + 1].createdAt, message.createdAt);

                if (isNewDate) {
                    acc.push(
                        <div key={`date-${message.createdAt}`} className="my-2 text-center text-sm text-gray-500">
                            <span className="rounded-full bg-gray-200 px-2 py-1 shadow-md">
                                {getDateLong(message.createdAt)}
                            </span>
                        </div>,
                    );
                }

                const borderRadiusClass = `${isFirstInChain ? "rounded-t-lg" : ""} ${isLastInChain ? "rounded-b-lg" : ""} ${!isFirstInChain && !isLastInChain ? "rounded-none" : ""}`;

                acc.push(
                    <div key={message._id} className={`mb-1 flex gap-4 ${isFirstInChain ? "mt-4" : "mt-1"}`}>
                        {isFirstInChain ? (
                            <CirclePicture circle={message.author} size="40px" className="pt-2" openPreview={true} />
                        ) : (
                            <div className="h-10 w-10 flex-shrink-0"></div>
                        )}
                        <div className={`flex flex-col`}>
                            <div className={`bg-white p-2 pr-4 shadow-md ${borderRadiusClass}`}>
                                <RichText content={message.content} mentions={message.mentionsDisplay} />
                            </div>
                            {isLastInChain && (
                                <span className="mt-1 text-xs text-gray-500">{formatChatDate(message.createdAt)}</span>
                            )}
                        </div>
                    </div>,
                );

                return acc;
            }, [])}
        </div>
    );
};

export type ChatRoomProps = {
    circle: Circle;
    initialMessages: ChatMessageDisplay[];
    page: Page;
    chatRoom: ChatRoom;
    subpage?: string;
    isDefaultCircle?: boolean;
};

const generateDummyMessages = (user: Circle, count: number) => {
    const messages: ChatMessageDisplay[] = [];
    let user2 = { ...user, _id: "2", name: "User 2", picture: { url: "/images/default-picture.png" } };

    // Shorter messages
    const shortMessages = [
        "Hello there!",
        "How's it going?",
        "This is a random message.",
        "Here's something interesting.",
        "What are your thoughts on this?",
        "Just checking in!",
        "Hope you're having a great day.",
        "Let's catch up soon.",
        "Any updates on the project?",
        "Have a wonderful day ahead!",
    ];

    // Longer messages (1-2 paragraphs)
    const longMessages = [
        "In today's fast-paced world, it's important to take time to slow down and reflect on the things that truly matter. We often get caught up in the hustle, but moments of stillness are where we find clarity and peace.",
        "I wanted to share a few thoughts on the latest project. While we're making great progress, there are a few areas where we could improve. For example, the design team has been doing excellent work, but we need to ensure that our timelines are aligned with the development team. Additionally, it might be worth considering a few adjustments to the overall strategy to make sure we're meeting our long-term goals effectively. Let's discuss this further in our next meeting.",
        "Life is full of unexpected twists and turns. We can plan as much as we want, but in the end, it's our ability to adapt that determines our success. I've learned that embracing uncertainty and remaining flexible are some of the most valuable skills we can develop.",
        "One of the most profound realizations I've come to over the years is that true happiness comes from within. We often search for validation, success, or happiness in external things, but it's the inner work that truly transforms our lives. The more we learn to be content with who we are, the more we can spread joy and kindness to those around us.",
        "The latest report on climate change was both alarming and motivating. It reminds us that while the challenges we face are immense, there are still actions we can take as individuals and as a society. Together, we must work toward a more sustainable future, finding creative solutions to protect our planet and ensure a safe future for generations to come.",
    ];

    for (let i = 0; i < count; i++) {
        // Randomly select the author (50% chance for user1 or user2)
        const author = Math.random() < 0.5 ? user : user2;

        // Select either a short or long message, ensuring about half are long
        const content =
            Math.random() < 0.5
                ? longMessages[Math.floor(Math.random() * longMessages.length)]
                : shortMessages[Math.floor(Math.random() * shortMessages.length)];

        messages.push({
            _id: i,
            chatRoomId: "1",
            createdBy: "did:example:123",
            createdAt: new Date(),
            content: content,
            media: [],
            repliesToMessageId: null,
            reactions: { likes: 0 },
            mentions: [],
            author: author,
            userReaction: undefined,
            mentionsDisplay: [],
        });
    }
    return messages;
};

export const ChatRoomComponent = ({
    circle,
    initialMessages,
    page,
    subpage,
    chatRoom,
    isDefaultCircle,
}: ChatRoomProps) => {
    const isCompact = useIsCompact();
    const [user] = useAtom(userAtom);
    const router = useRouter();

    const [messages, setMessages] = useState<ChatMessageDisplay[]>(initialMessages);
    const [newMessage, setNewMessage] = useState("");
    const inputRef = useRef<HTMLDivElement>(null);
    const [inputWidth, setInputWidth] = useState<number | null>(null);
    const isMobile = useIsMobile();
    const [mapOpen] = useAtom(mapOpenAtom);
    const [triggerMapOpen] = useAtom(triggerMapOpenAtom);
    const [hideInput, setHideInput] = useState(false);

    // useEffect(() => {
    //     if (!user) return;

    //     const dummyMessages = generateDummyMessages(user, 200);
    //     setMessages(dummyMessages);
    // }, [user]);

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

    useEffect(() => {
        if (triggerMapOpen) {
            setHideInput(true);
        }
    }, [triggerMapOpen]);

    const handleFilterChange = (filter: string) => {
        router.push("?sort=" + filter);
    };

    return (
        <div
            className={`flex h-full min-h-screen flex-1 items-start justify-center`}
            // `flex h-full min-h-screen flex-1 items-start justify-center bg-white ${isCompact ? "" : "mt-3 overflow-hidden rounded-t-[15px]"}`
            style={{
                flexGrow: isCompact ? "1" : "3",
                maxWidth: isCompact ? "none" : "700px",
            }}
        >
            <div ref={inputRef} className="relative flex h-full w-full flex-col">
                <div className="mt-4">
                    <CircleHeader
                        circle={circle}
                        page={page}
                        subpage={chatRoom.handle && chatRoom.handle !== "default" ? chatRoom.name : undefined}
                        isDefaultCircle={isDefaultCircle}
                    />
                </div>
                {/* <ListFilter onFilterChange={handleFilterChange} /> */}

                <div className="flex-grow p-4 pb-[144px]">
                    <ChatMessages
                        messages={messages}
                        chatRoom={chatRoom}
                        circle={circle}
                        page={page}
                        subpage={subpage}
                    />
                    {/* <ChatMessages messages={messages} chatRoom={chatRoom} circle={circle} page={page} subpage={subpage} /> */}
                </div>

                <div
                    className="fixed h-[72px]"
                    style={{
                        width: `${inputWidth}px`,
                        bottom: isMobile ? "72px" : "0px",
                        opacity: hideInput ? 0 : 1,
                    }}
                >
                    <div className="flex h-[72px] items-end bg-[#fbfbfb] pb-1 pl-2 pr-2">
                        <ChatInput
                            setMessages={setMessages}
                            circle={circle}
                            chatRoom={chatRoom}
                            page={page}
                            subpage={subpage}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
