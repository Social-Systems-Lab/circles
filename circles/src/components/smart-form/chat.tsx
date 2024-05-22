"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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

type Message = {
    type: "Assistant" | "User";
    text: string;
    options?: string[];
    stream?: boolean;
    streamMessage?: string;
    streamDone?: boolean;
};

type ChatMessageProps = {
    message: Message;
    onOptionClick?: (option: string) => void;
    isPending?: boolean;
};

export function ChatMessage({ message, isPending, onOptionClick }: ChatMessageProps) {
    // stream the message
    const isAssistant = message.type === "Assistant";
    const options = message.options ?? [];

    return (
        <div className={`flex flex-row gap-2 pb-4`}>
            <div className="flex flex-shrink-0 w-[22px] h-[22px] mt-[4px] rounded-full border-gray-300 border justify-center items-center">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isAssistant ? <Bot size={18} /> : <FaRegUser size={14} />}
            </div>
            <div className="flex flex-col">
                <div className={`flex-1 flex flex-col p-2 rounded-md ${isAssistant ? "bg-gray-100" : "bg-blue-100"}`}>
                    <MemoizedReactMarkdown className="formatted">{message.text}</MemoizedReactMarkdown>
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
    onOptionClick: (option: string) => void;
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

    const handleSend = () => {
        if (input.trim()) {
            onSend(input);
            setInput("");
        }
    };

    return (
        <div className="flex flex-shrink-0 items-center space-x-2 p-2">
            <Input
                type="text"
                className="flex-grow p-2 border border-gray-300 rounded-md"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
            />
            <Button onClick={handleSend}>Send</Button>
        </div>
    );
}

export function AssistantChat() {
    const [responseMessage, setResponseMessage] = useState<Message>({
        type: "Assistant",
        text: "Hi there! I'm your automated assistant. I'm here to help you join the Circles platform and make the most out of your experience. Do you have an account?",
        options: ["Yes, I have an account", "I want to create an account", "Why should I join?"],
    });
    const [messages, setMessages] = useState<Message[]>([]);
    const [isPending, startTransition] = useTransition();

    const onOptionClick = (option: string) => {
        handleSend(option);
    };

    const handleSend = async (message: string) => {
        // add response message to list of chat messages
        setMessages((messages) => [...messages, responseMessage, { type: "User", text: message }]);

        // add new response message for new AI response
        let pendingResponseMessage: Message = {
            type: "Assistant",
            text: "",
        };
        setResponseMessage(pendingResponseMessage);

        // console.log(JSON.stringify(messages, null, 2));
        // console.log(JSON.stringify(pendingResponseMessage, null, 2));

        startTransition(async () => {
            const { output } = await getStreamedAnswer(message);

            for await (const delta of readStreamableValue(output)) {
                setResponseMessage((currentResponse) => ({ ...currentResponse, text: `${currentResponse.text}${delta}` }));
            }
        });

        // add AI answer
        // setMessages([...newMessages, { type: "Assistant", stream: true, streamMessage: message }]);

        // get AI answer
        // const { text } = await getAnswer(message);
        // setMessages([...newMessages, { type: "Assistant", text }]);

        // // Simulate bot response and options
        // setTimeout(() => {
        //     setMessages((prevMessages) => [
        //         ...prevMessages,
        //         {
        //             type: "Assistant",
        //             text: "Great can you start by telling me if this account will be personal account, i.e. tied to you as an individual, or an organization account which will represent an organization?",
        //             options: ["Personal", "Organization", "Can you help me decide?"],
        //         },
        //     ]);
        // }, 1000);
    };

    return (
        <div className="flex-1 flex flex-col w-full" style={{ height: "0px" }}>
            {/* height set to 0px because ScrollArea doesn't work without it */}
            <div className="flex-1 flex flex-col justify-center items-center relative overflow-hidden">
                <ScrollArea className="flex-1 relative overflow-hidden">
                    {/* <Scrollbars autoHide> */}
                    <div className="flex flex-col space-y-4 p-4">
                        <ChatMessages messages={messages} onOptionClick={onOptionClick} />
                        <ChatMessage message={responseMessage} isPending={isPending} onOptionClick={onOptionClick} />
                    </div>
                    {/* </Scrollbars> */}
                </ScrollArea>
            </div>
            <InputBox onSend={handleSend} />
        </div>
    );
}
