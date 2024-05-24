"use client";

import { KeyboardEvent, KeyboardEventHandler, useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { getAnswer, getStreamedAnswer } from "./actions";
import { readStreamableValue } from "ai/rsc";
import { FaRegUser } from "react-icons/fa";
import { RiRobot3Line } from "react-icons/ri";
import { Bot, Loader2 } from "lucide-react";
import { Scrollbars } from "react-custom-scrollbars-2";
import { MemoizedReactMarkdown } from "../memoized-markdown";
import { ScrollArea } from "../ui/scroll-area";
import { FormData, InputProvider, Message } from "@/models/models";
import { CoreUserMessage } from "ai";
import { useIsMobile } from "../use-is-mobile";

type ChatMessageProps = {
    message: Message;
    onOptionClick?: (option: string) => void;
    isPending?: boolean;
};

export function ChatMessage({ message, isPending, onOptionClick }: ChatMessageProps) {
    // stream the message
    const isAssistant = message.coreMessage.role === "assistant";
    const options = message.options ?? [];
    const getMessageContent = () => {
        switch (message.coreMessage.role) {
            case "assistant":
            case "user":
            case "system":
                return message.coreMessage.content.toString();
            case "tool":
                return JSON.stringify(message.coreMessage.content);
        }
    };

    return (
        <div className={`flex flex-row gap-2 pb-4`}>
            <div className="flex flex-shrink-0 w-[22px] h-[22px] mt-[4px] rounded-full border-gray-300 border justify-center items-center">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isAssistant ? <Bot size={18} /> : <FaRegUser size={14} />}
            </div>
            <div className="flex flex-col">
                <div className={`flex-1 flex flex-col p-2 rounded-md ${isAssistant ? "bg-gray-100" : "bg-[#e8fff4]"}`}>
                    <MemoizedReactMarkdown className="formatted">{getMessageContent()}</MemoizedReactMarkdown>
                </div>
                <OptionsPane options={options} onOptionClick={onOptionClick} />
            </div>
        </div>
    );
}

type ChatMessagesProps = {
    messages: Message[];
    onOptionClick?: (option: string) => void;
};

export function ChatMessages({ messages, onOptionClick }: ChatMessagesProps) {
    return (
        <>
            {messages.map((msg, index) => (
                <ChatMessage key={index} message={msg} onOptionClick={onOptionClick} />
            ))}
        </>
    );
}

type OptionsPaneProps = {
    options: string[];
    onOptionClick?: (option: string) => void;
};

export function OptionsPane({ options, onOptionClick }: OptionsPaneProps) {
    // get color based on index
    const getColor = (index: number) => {
        //        const colors = ["#ffe4ab", "#58dda1", "#b7abff"];
        const colors = ["#ffdef1", "#fff7ed", "#58dda1", "#dd587e", "#b0bbb6"];
        return colors[index % colors.length];
    };

    return (
        <div className={`grid grid-cols-2 gap-2 pt-2 ${options.length > 0 ? "block" : "hidden"}`}>
            {options.map((option, index) => (
                <div
                    key={index}
                    className="flex-1 flex flex-row min-h-[40px] cursor-pointer items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground relative overflow-hidden"
                    onClick={onOptionClick ? () => onOptionClick(option) : undefined}
                >
                    <div
                        className={`flex flex-row justify-center items-center text-[10px] font-bold text-white m-0 p-0 w-[16px] h-full bg-[#58dda1]`}
                        // style={{
                        //     backgroundColor: getColor(index),
                        // }}
                    >
                        {index + 1}
                    </div>
                    <div className="flex-1 pl-2 pr-1 py-1">{option}</div>
                    {/* e59b67 fff7ed #58dda1 #dd587e #b0bbb6 #ffb5b5 #b5ffc4 */}
                </div>
            ))}
        </div>
    );
}

type InputBoxProps = {
    onSend: (message: string) => void;
};

function InputBox({ onSend }: InputBoxProps) {
    const [input, setInput] = useState<string>("");
    const isMobile = useIsMobile();

    const handleSend = () => {
        if (input.trim()) {
            onSend(input);
            setInput("");
        }
    };

    const handleMessageKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
        if (!isMobile && e.keyCode === 13 && !e.shiftKey) {
            e.preventDefault();
            await handleSend();
        } else {
            return;
        }
    };

    return (
        <div className="flex flex-shrink-0 items-center space-x-2 p-2">
            <Input
                type="text"
                className="flex-grow p-2 border border-gray-300 rounded-md"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleMessageKeyDown}
                placeholder="Type your message..."
            />
            <Button onClick={handleSend}>Send</Button>
        </div>
    );
}

type AssistantChatProps = {
    formData: any;
    setFormData: (data: any) => void;
};

export function AiChat({ formData, setFormData, context, setContext }: AssistantChatProps) {
    useEffect(() => {
        // initialize the chat with a welcome message from the context
        setMessages([]);
        const welcomeMessage = context.steps[0].prompt;
        let newResponseMessage: Message = {
            coreMessage: {
                role: "assistant",
                content: welcomeMessage,
            },
            options: context.steps[0].inputProvider?.data,
        };
        setResponseMessage(newResponseMessage);
    }, [context]);

    const [responseMessage, setResponseMessage] = useState<Message>();
    const [messages, setMessages] = useState<Message[]>([]);
    const [isPending, startTransition] = useTransition();

    const onOptionClick = (option: string) => {
        handleSend(option);
    };

    const handleSend = async (message: string) => {
        // add response message to list of chat messages
        let userMessage: Message = { coreMessage: { role: "user", content: message } };
        let newMessages = responseMessage ? [...messages, responseMessage, userMessage] : [...messages, userMessage];
        setMessages(newMessages);

        // add new response message for new AI response
        let pendingResponseMessage: Message = {
            coreMessage: {
                role: "assistant",
                content: "",
            },
        };
        setResponseMessage(pendingResponseMessage);

        startTransition(async () => {
            const { output } = await getStreamedAnswer(newMessages, formData);

            let streamedResponseText = "";
            for await (const delta of readStreamableValue(output)) {
                if (typeof delta === "string") {
                    streamedResponseText = `${streamedResponseText}${delta}`;
                    setResponseMessage((currentResponse) => {
                        if (!currentResponse) return undefined;
                        let newMessage: Message = { ...currentResponse };
                        newMessage.coreMessage.content = streamedResponseText;
                        return newMessage;
                    });
                } else if (delta && "type" in delta) {
                    if (delta.type === "form-data") {
                        setFormData((delta as FormData).data);
                    } else if (delta?.type === "input-provider") {
                        let inputType = (delta as InputProvider).inputType;
                        let data = (delta as InputProvider).data;
                        console.log("input-provider", inputType, data);
                        if (inputType === "options") {
                            setResponseMessage((currentResponse) => {
                                let newMessage: Message = { ...currentResponse };
                                newMessage.options = (delta as InputProvider).data;
                                return newMessage;
                            });
                        } // TODO handle rest of input types
                    } else if (delta.type === "context") {
                    }
                }
            }
        });
    };

    return (
        <div className="flex-1 flex flex-col w-full" style={{ height: "0px" }}>
            {/* height set to 0px because ScrollArea doesn't work without it */}
            <div className="flex-1 flex flex-col justify-center items-center relative overflow-hidden">
                <ScrollArea className="flex-1 relative overflow-hidden">
                    {/* <Scrollbars autoHide> */}
                    <div className="flex flex-col space-y-4 p-4">
                        <ChatMessages messages={messages} onOptionClick={onOptionClick} />
                        {responseMessage && <ChatMessage message={responseMessage} isPending={isPending} onOptionClick={onOptionClick} />}
                    </div>
                    {/* </Scrollbars> */}
                </ScrollArea>
            </div>
            <InputBox onSend={handleSend} />
        </div>
    );
}
