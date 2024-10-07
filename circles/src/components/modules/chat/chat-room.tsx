"use client";

import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle, ChatRoom, Page, ChatMessageDisplay } from "@/models/models";
import CircleHeader from "../circles/circle-header";
import { userAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export type ChatRoomProps = {
    circle: Circle;
    initialMessages: ChatMessageDisplay[];
    page: Page;
    chatRoom: ChatRoom;
    subpage?: string;
    isDefaultCircle?: boolean;
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

    const handleSendMessage = () => {
        if (!user) return;
        if (newMessage.trim() !== "") {
            const now = new Date();
            setMessages([
                ...messages,
                {
                    _id: messages.length + 1,
                    author: user as Circle,
                    content: newMessage,
                    createdBy: user.did!,
                    createdAt: now,
                    chatRoomId: chatRoom._id,
                    repliesToMessageId: null,
                    reactions: { likes: 0 },
                },
            ]);
            setNewMessage("");
        }
    };

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
            <div className="flex w-full flex-col">
                <div className="mt-4">
                    <CircleHeader
                        circle={circle}
                        page={page}
                        subpage={chatRoom.handle && chatRoom.handle !== "default" ? chatRoom.name : undefined}
                        isDefaultCircle={isDefaultCircle}
                    />
                </div>
                {/* <ListFilter onFilterChange={handleFilterChange} /> */}

                <ScrollArea className="flex-grow p-4">
                    {/* <ChatMessages messages={messages} chatRoom={chatRoom} circle={circle} page={page} subpage={subpage} /> */}
                </ScrollArea>

                <div className="border-t p-4">
                    <div className="flex items-center">
                        <Input
                            type="text"
                            placeholder="Type a message..."
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            className="mr-2 flex-grow"
                            onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                        />
                        <Button onClick={handleSendMessage} className="bg-purple-500 text-white hover:bg-purple-600">
                            Send
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
