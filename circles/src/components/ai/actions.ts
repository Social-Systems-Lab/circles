"use server";

import {
    generateText,
    streamText,
    generateObject,
    CoreMessage,
    CoreSystemMessage,
    ToolContent,
    CoreToolMessage,
    CoreAssistantMessage,
    ToolResultPart,
} from "ai";
import { StreamableValue, createStreamableValue } from "ai/rsc";
import { OpenAIProvider, createOpenAI } from "@ai-sdk/openai";
import { ServerConfigs } from "@/lib/db";
import { AddedMessages, ContextInfo, Message } from "@/models/models";
import { getContextSystemMessage, getContextTools } from "@/lib/ai-contexts-tools";
import { aiContexts } from "@/lib/ai-contexts";

export async function getAnswer(question: string) {
    // get openaikey from db
    const serverConfig = await ServerConfigs.findOne({});
    const openaiKey = serverConfig?.openaiKey;
    if (!openaiKey) {
        throw new Error("OpenAI key not found");
    }

    let openAiProvider = createOpenAI({ apiKey: openaiKey });

    let { text, finishReason, usage } = await generateText({
        model: openAiProvider("gpt-4o"),
        prompt: question,
    });
    //text = JSON.stringify({ text, finishReason, usage });
    return { text, finishReason, usage };
}

const debug = false;

const printMessage = (message: Message) => {
    if (!debug) {
        return;
    }
    let output = "";
    output += message.coreMessage.role + ": ";
    if (typeof message.coreMessage.content === "string") {
        output += message.coreMessage.content;
    } else {
        let content = message.coreMessage.content?.[0];
        if (content.type === "tool-call") {
            output += "calling " + content.toolName + "(" + JSON.stringify(content.args) + ")";
        } else if (content.type === "tool-result") {
            output += content.toolName + " response: " + JSON.stringify(content.result);
        }
    }
    output += "\n";
    console.log(output);
    return output;
};

const printMessages = (messages: Message[]) => {
    messages.forEach((message) => {
        printMessage(message);
    });
};

async function streamResponse(provider: OpenAIProvider, c: ContextInfo, closeStream: boolean) {
    c.currentContextId = c.contextId;
    c.context = aiContexts[c.contextId];

    if (!c.context) {
        if (closeStream) {
            c.stream.done();
        }
        return;
    }
    let systemMessage = getContextSystemMessage(c);
    let coreMessages = [systemMessage, ...c.messages.map((x) => x.coreMessage)];

    //console.log("formData", formData);
    if (closeStream) {
        if (debug) console.log(systemMessage);
        printMessages(c.messages);
    }

    if (debug) console.log(`------ START ${c.currentContextId} ------`);

    //console.log("coreMessages", coreMessages);

    // get tools for context
    let tools = getContextTools(c);
    console.log("tools: ", tools);

    const { fullStream } = await streamText({
        model: provider("gpt-4o"),
        messages: coreMessages,
        tools: tools,
    });

    let newMessages: Message[] = [];

    // response message here is just for easy debug and printing
    let printResponseMessage: Message = { coreMessage: { role: "assistant", content: "" }, toolCall: false };

    for await (const delta of fullStream) {
        if (delta.type === "text-delta") {
            printResponseMessage.coreMessage.content += delta.textDelta;
            c.stream.update(delta.textDelta);
        } else if (delta.type === "tool-call") {
            if (shouldContinueGenerating(delta)) {
                let coreToolCallMessage: CoreAssistantMessage = { role: "assistant", content: [delta] };
                let newMessage: Message = { coreMessage: coreToolCallMessage, toolCall: true };
                printMessage(newMessage);
                newMessages.push(newMessage);
            }
        } else if (delta.type === "tool-result") {
            if (shouldContinueGenerating(delta)) {
                let coreToolMessage: CoreToolMessage = { role: "tool", content: [delta] };
                let newMessage: Message = { coreMessage: coreToolMessage, toolCall: true };
                printMessage(newMessage);
                newMessages.push(newMessage);
            }
        }
    }

    // if we have tool results we make another call to get more responses
    if (newMessages.length > 0) {
        let addedMessages: AddedMessages = { type: "added-messages", messages: newMessages };
        c.stream.update(addedMessages);
        try {
            c.messages = [...c.messages, ...newMessages];
            await streamResponse(provider, c, false);
        } catch (e) {}
    }

    printMessage(printResponseMessage);

    if (debug) console.log(`------ END ${c.currentContextId} ------`);
    if (closeStream) {
        c.stream.done();
    }
}

function shouldContinueGenerating(delta: any) {
    if (delta.type === "tool-call" || delta.type === "tool-result") {
        if (delta.toolName === "updateFormData") {
            return true;
        } else if (delta.toolName === "presentSuggestions") {
            return false;
            //return delta.args.inputType !== "submit-form";
        } else if (delta.toolName === "initiateStep") {
            return true;
        } else if (delta.toolName === "switchContext") {
            return true;
        }
    }
    return true;
}

export async function getStreamedAnswer(messages: Message[], formData: any, contextId: string) {
    // get openaikey from db
    const serverConfig = await ServerConfigs.findOne({});
    const openaiKey = serverConfig?.openaiKey;
    if (!openaiKey) {
        throw new Error("OpenAI key not found");
    }

    let openAiProvider = createOpenAI({ apiKey: openaiKey });
    const stream = createStreamableValue<StreamableValue>("");

    let c: ContextInfo = {
        currentContextId: contextId,
        contextId: contextId,
        context: aiContexts[contextId],
        formData: formData,
        stream: stream,
        messages: messages,
    };

    streamResponse(openAiProvider, c, true);

    return { output: stream.value };
}
