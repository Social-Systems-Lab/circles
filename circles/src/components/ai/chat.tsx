"use client";

import { KeyboardEvent, KeyboardEventHandler, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { getStreamedAnswer } from "./actions";
import { readStreamableValue } from "ai/rsc";
import { FaRegUser } from "react-icons/fa";
import { Bot, Loader2 } from "lucide-react";
import { MemoizedReactMarkdown } from "../memoized-markdown";
import { ScrollArea } from "../ui/scroll-area";
import { AiContext, AddedMessages, FormData, InputProvider, Message, SwitchContext } from "@/models/models";
import { useIsMobile } from "../use-is-mobile";
import { aiContexts } from "@/lib/ai-contexts";

type ChatMessageProps = {
    message: Message;
    onSuggestionClick?: (suggestion: string) => void;
    isPending?: boolean;
};

const showToolCalls = true;

export function ChatMessage({ message, isPending, onSuggestionClick: onOptionClick }: ChatMessageProps) {
    // stream the message
    const isAssistant = message.coreMessage.role !== "user";
    const inputProvider = message.inputProvider;
    const messageContent = useMemo(() => {
        switch (message.coreMessage.role) {
            case "assistant":
                // could be a tool call message or regular message
                if (typeof message.coreMessage.content === "string") {
                    return message.coreMessage.content.toString();
                } else {
                    // tool call
                    let content = message.coreMessage.content?.[0];
                    if (content.type === "tool-call") {
                        return "Calling function " + content.toolName + "(" + JSON.stringify(content.args) + ")";
                    } else {
                        return "Unknown message";
                    }
                }
            case "user":
            case "system":
                return message.coreMessage.content.toString();
            case "tool":
                let content = message.coreMessage.content?.[0];
                if (content.type === "tool-result") {
                    return content.toolName + " response: " + JSON.stringify(content.result);
                } else {
                    return "Unknown message";
                }
        }
    }, [message]);

    const getInputProviderComponent = () => {
        if (inputProvider) {
            switch (inputProvider.inputType) {
                case "suggestions":
                    return <SuggestionsInput suggestions={inputProvider.data} onSuggestionClick={onOptionClick} message={message} />;
                default:
                    return null;
            }
        } else {
            return null;
        }
    };

    return (
        <div className={`flex flex-row gap-2 pb-4`}>
            <div className="flex flex-shrink-0 w-[22px] h-[22px] mt-[4px] rounded-full border-gray-300 border justify-center items-center">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isAssistant ? <Bot size={18} /> : <FaRegUser size={14} />}
            </div>
            <div className="flex flex-col w-full">
                {messageContent && (
                    <div className="flex flex-row items-start">
                        <div className={`flex flex-col p-2 rounded-md ${isAssistant ? "bg-gray-100" : "bg-[#e8fff4]"}`}>
                            <MemoizedReactMarkdown className="formatted">{messageContent}</MemoizedReactMarkdown>
                        </div>
                    </div>
                )}
                {!isPending && getInputProviderComponent()}
            </div>
        </div>
    );
}

type ChatMessagesProps = {
    messages: Message[];
    onSuggestionClick?: (suggestion: string) => void;
};

export function ChatMessages({ messages, onSuggestionClick }: ChatMessagesProps) {
    if (showToolCalls) {
        return (
            <>
                {messages.map((msg, index) => (
                    <ChatMessage key={index} message={msg} onSuggestionClick={onSuggestionClick} />
                ))}
            </>
        );
    }

    return (
        <>
            {messages
                .filter((x) => !x.toolCall)
                .map((msg, index) => (
                    <ChatMessage key={index} message={msg} onSuggestionClick={onSuggestionClick} />
                ))}
        </>
    );
}

type SuggestionsInputProps = {
    suggestions: string[];
    onSuggestionClick?: (suggestion: string) => void;
    message: Message;
};

export function SuggestionsInput({ suggestions, onSuggestionClick, message }: SuggestionsInputProps) {
    const [selectedSuggestion, setSelectedSuggestion] = useState<string>(message.suggestion ?? "");

    // get color based on index
    const getColor = (index: number) => {
        //        const colors = ["#ffe4ab", "#58dda1", "#b7abff"];
        const colors = ["#ffdef1", "#fff7ed", "#58dda1", "#dd587e", "#b0bbb6"];
        return colors[index % colors.length];
    };

    const onSuggestionItemClick = (suggestion: string) => {
        message.suggestion = suggestion;
        setSelectedSuggestion(suggestion);
        if (onSuggestionClick) {
            onSuggestionClick(suggestion);
        }
    };

    const isChosen = (selectedSuggestion: string, suggestion: string) => {
        return selectedSuggestion === suggestion;
    };
    const isNotChosen = (selectedSuggestion: string, suggestion: string) => {
        return selectedSuggestion !== "" && selectedSuggestion !== suggestion;
    };

    return (
        <div className={`grid grid-cols-2 gap-2 pt-2 ${suggestions.length > 0 ? "block" : "hidden"}`}>
            {suggestions.map((suggestion, index) => (
                <div
                    key={index}
                    className={`flex-1 flex flex-row min-h-[40px] cursor-pointer items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground relative overflow-hidden`}
                    onClick={() => onSuggestionItemClick(suggestion)}
                >
                    <div
                        className={`flex flex-row justify-center items-center text-[10px] font-bold text-white m-0 p-0 w-[16px] h-full`}
                        style={{
                            backgroundColor: isNotChosen(selectedSuggestion, suggestion) ? "#d5d5d5" : "#58dda1",
                        }}
                    >
                        {index + 1}
                    </div>
                    <div className={`flex-1 pl-2 pr-1 py-1`}>{suggestion}</div>
                    {/* e59b67 fff7ed #58dda1 #dd587e #b0bbb6 #ffb5b5 #b5ffc4 
                    selectedBg: #bfffd5
                    unselectedBg: #d5d5d5
                    unselectedText: #a7a7a7
                    */}
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
    context: AiContext;
    setContext: (context: AiContext) => void;
};

export function AiChat({ formData, setFormData, context, setContext }: AssistantChatProps) {
    const [initialized, setInitialized] = useState(false);
    const viewportRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (initialized) return;
        setInitialized(true);

        // initialize the chat with a welcome message from the context
        const welcomeMessage = context.steps[0].prompt ?? "";
        let newResponseMessage: Message = {
            coreMessage: {
                role: "assistant",
                content: welcomeMessage,
            },
            inputProvider: context.steps[0].inputProvider,
        };
        setResponseMessage(newResponseMessage);
    }, [context, initialized]);

    const [responseMessage, setResponseMessage] = useState<Message>();
    const [messages, setMessages] = useState<Message[]>([]);
    const [isPending, startTransition] = useTransition();

    const onSuggestionClick = (suggestion: string) => {
        handleSend(suggestion);
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
            const { output } = await getStreamedAnswer(newMessages, formData, context.id);

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
                        setResponseMessage((currentResponse) => {
                            if (!currentResponse) return undefined;
                            let newMessage: Message = { ...currentResponse };
                            newMessage.inputProvider = delta as InputProvider;
                            return newMessage;
                        });
                    } else if (delta.type === "switch-context") {
                        let contextId = (delta as SwitchContext).contextId;
                        console.log("CLIENT: switch-context", contextId);
                        let newContext = aiContexts[contextId];
                        if (newContext) {
                            setMessages([]);
                            setContext(newContext);
                        }
                        // console.log("switch-context", contextId);
                    } else if (delta.type === "added-messages") {
                        let newMessages = (delta as AddedMessages).messages;
                        setMessages((currentMessages) => [...currentMessages, ...newMessages]);
                    }
                }

                // scroll to bottom
                if (viewportRef.current) {
                    viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
                }
            }
        });
    };

    return (
        <div className="flex-1 flex flex-col w-full" style={{ height: "0px" }}>
            {/* height set to 0px because ScrollArea doesn't work without it */}
            <div className="flex-1 flex flex-col justify-center items-center relative overflow-hidden">
                <ScrollArea viewportRef={viewportRef} className="flex-1 relative overflow-hidden w-full">
                    {/* <Scrollbars autoHide> */}
                    <div className="flex flex-col space-y-4 p-4 w-full">
                        <ChatMessages messages={messages} onSuggestionClick={onSuggestionClick} />
                        {responseMessage && <ChatMessage message={responseMessage} isPending={isPending} onSuggestionClick={onSuggestionClick} />}
                    </div>
                    {/* </Scrollbars> */}
                </ScrollArea>
            </div>
            <InputBox onSend={handleSend} />
        </div>
    );
}
