"use client";

import {
    KeyboardEvent,
    KeyboardEventHandler,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    useTransition,
} from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { getStreamedAnswer } from "./actions";
import { readStreamableValue } from "ai/rsc";
import { FaRegUser } from "react-icons/fa";
import { Bot, Loader2 } from "lucide-react";
import { MemoizedReactMarkdown } from "../../lib/memoized-markdown";
import { ScrollArea } from "../ui/scroll-area";
import { AiContext, AddedMessages, FormData, InputProvider, Message, SwitchContext } from "@/models/models";
import { useIsMobile } from "../../lib/use-is-mobile";
import { aiContexts } from "@/lib/ai-contexts";
import _ from "lodash"; // to throttle calls
import { useThrottle } from "../../lib/use-throttle";

type ChatMessageProps = {
    message: Message;
    onSuggestionClick?: (suggestion: string) => void;
    isPending?: boolean;
};

const showToolCalls = false; // set to true to show AI tool calls in chat messages, useful for debugging

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
                    return (
                        <SuggestionsInput
                            suggestions={inputProvider.data}
                            onSuggestionClick={onOptionClick}
                            message={message}
                        />
                    );
                default:
                    return null;
            }
        } else {
            return null;
        }
    };

    return (
        <div className={`flex flex-row gap-2 pb-4`}>
            <div className="mt-[4px] flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border border-gray-300">
                {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : isAssistant ? (
                    <Bot size={18} />
                ) : (
                    <FaRegUser size={14} />
                )}
            </div>
            <div className="flex w-full flex-col">
                {messageContent && (
                    <div className="flex flex-row items-start">
                        <div className={`flex flex-col rounded-md p-2 ${isAssistant ? "bg-gray-100" : "bg-[#e8fff4]"}`}>
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
                    className={`relative flex min-h-[40px] flex-1 cursor-pointer flex-row items-center justify-center overflow-hidden rounded-md border border-input bg-background text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50`}
                    onClick={() => onSuggestionItemClick(suggestion)}
                >
                    <div
                        className={`m-0 flex h-full w-[16px] flex-row items-center justify-center p-0 text-[10px] font-bold text-white`}
                        style={{
                            backgroundColor: isNotChosen(selectedSuggestion, suggestion) ? "#d5d5d5" : "#58dda1",
                        }}
                    >
                        {index + 1}
                    </div>
                    <div className={`flex-1 py-1 pl-2 pr-1`}>{suggestion}</div>
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
                className="flex-grow rounded-md border border-gray-300 p-2"
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
    const [responseMessage, setResponseMessage] = useState<Message>();
    const [messages, setMessages] = useState<Message[]>([]);
    const [isPending, startTransition] = useTransition();

    const handleSend = useCallback(
        async (message: string | null) => {
            console.log("inside handleSend()");

            // add response message to list of chat messages
            if (isPending) return;

            let newMessages: Message[] = [];
            if (message) {
                let userMessage: Message = {
                    coreMessage: { role: "user", content: message },
                };
                newMessages = responseMessage
                    ? [...messages, responseMessage, userMessage]
                    : [...messages, userMessage];
                setMessages(newMessages);
            }

            // add new response message for new AI response
            let pendingResponseMessage: Message = {
                coreMessage: {
                    role: "assistant",
                    content: "",
                },
            };
            setResponseMessage(pendingResponseMessage);

            startTransition(async () => {
                console.log("calling getStreamedAnswer()");
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
                                setMessages([]); // TODO we might want to keep a context history so the user can return to previous contexts easily
                                setContext(newContext);
                            }
                            // console.log("switch-context", contextId);
                        } else if (delta.type === "added-messages") {
                            let newMessages = (delta as AddedMessages).messages;
                            setMessages((currentMessages) => [...currentMessages, ...newMessages]);
                        } else if (delta.type === "auth-data") {
                            // TODO set auth data
                            console.log("auth-data", delta);
                        }
                    }

                    // scroll to bottom
                    if (viewportRef.current) {
                        viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
                    }
                }
            });
        },
        [context.id, formData, messages, responseMessage, setContext, setFormData, isPending],
    );

    const throttledHandleSend = useThrottle(handleSend, 1000);

    useEffect(() => {
        if (!initialized) {
            setInitialized(true);
            console.log("calling handleSend()");
            // initialize the chat by triggering the first step
            throttledHandleSend(null);
        }

        // initialize the chat with a welcome message from the context
        // const welcomeMessage = context.steps[0].prompt ?? "";
        // let newResponseMessage: Message = {
        //     coreMessage: {
        //         role: "assistant",
        //         content: welcomeMessage,
        //     },
        //     inputProvider: context.steps[0].inputProvider,
        // };
        // setResponseMessage(newResponseMessage);
    }, [context, initialized, throttledHandleSend]);

    const onSuggestionClick = (suggestion: string) => {
        handleSend(suggestion);
    };

    return (
        <div className="flex w-full flex-1 flex-col" style={{ height: "0px" }}>
            {/* height set to 0px because ScrollArea doesn't work without it */}
            <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden">
                <ScrollArea viewportRef={viewportRef} className="relative w-full flex-1 overflow-hidden">
                    {/* <Scrollbars autoHide> */}
                    <div className="flex w-full flex-col space-y-4 p-4">
                        <ChatMessages messages={messages} onSuggestionClick={onSuggestionClick} />
                        {responseMessage && (
                            <ChatMessage
                                message={responseMessage}
                                isPending={isPending}
                                onSuggestionClick={onSuggestionClick}
                            />
                        )}
                    </div>
                    {/* </Scrollbars> */}
                </ScrollArea>
            </div>
            <InputBox onSend={handleSend} />
        </div>
    );
}
