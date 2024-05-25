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
import { AddedMessages, InputProvider, Message } from "@/models/models";
import { z } from "zod";
import { AiWizardStep, aiWizardContexts, getContextSystemMessage } from "@/models/ai-wizard-contexts";

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

async function setStep(stepNumber: number, contextId: string, stream: any): string {
    let context = aiWizardContexts[contextId];
    let stepDetails = context.steps.find((x) => x.stepNumber === stepNumber);
    if (!stepDetails) {
        return `Step ${stepNumber} not found in context ${contextId}`;
    }
    if (stepDetails.inputProvider) {
        stream.update(stepDetails.inputProvider);
    }
    if (stepDetails.generateInputProviderInstructions) {
        // call openAI to get input provider
    }

    // initiate step
    return `Step initiated: ${stepNumber}
   Instructions: ${stepDetails.instructions}`;
}

async function streamResponse(provider: OpenAIProvider, stream: any, messages: Message[], formData: any, contextId: string, closeStream: boolean) {
    let currentContextId = contextId;
    let context = aiWizardContexts[currentContextId];
    if (!context) {
        if (closeStream) {
            stream.done();
        }
        return;
    }
    let systemMessage = getContextSystemMessage(context, formData);
    let coreMessages = [systemMessage, ...messages.map((x) => x.coreMessage)];

    //console.log("formData", formData);
    if (closeStream) {
        if (debug) console.log(systemMessage);
        printMessages(messages);
    }

    if (debug) console.log(`------ START ${currentContextId} ------`);

    //console.log("coreMessages", coreMessages);

    const { fullStream } = await streamText({
        model: provider("gpt-4o"),
        messages: coreMessages,
        tools: {
            updateFormData: {
                description: "Updates the formData with new information",
                parameters: z.object({
                    key: z.string().describe("The field to update in the formData"),
                    value: z.string().describe("The value to update the field with"),
                }),
                execute: async ({ key, value }) => {
                    console.log("updateFormData");
                    console.log(key, value);

                    // update formData
                    formData[key] = value;
                    stream.update({ type: "form-data", data: formData });

                    return "Form value updated.";
                },
            },
            // presentSuggestions: {
            //     description:
            //         "Provides the user with some suggested answers to pick from to make things convenient. These suggestions will be presented along the regular text input",
            //     parameters: z.object({
            //         suggestions: z.array(z.string()).describe("An array of suggestions that is to presented to the user."),
            //     }),
            //     execute: async ({ suggestions }) => {
            //         let inputProvider: InputProvider = { type: "input-provider", inputType: "suggestions", data: suggestions };
            //         stream.update(inputProvider);
            //         return `The suggestions [${suggestions.join()}] will be presented to the user after your response.`;
            //     },
            // },
            initiateStep: {
                description: "Initiates a new step in the form to receive detailed information on how to guide the user through the step",
                parameters: z.object({
                    step: z.number().describe("The step to initiate"),
                }),
                execute: async ({ step }) => {
                    // get step details from context
                    return await setStep(step, contextId, stream);
                },
            },
            switchContext: {
                description: `Switches the conversation to a different context. Here are the available contexts:\n ${context.availableContexts.map(
                    (x) => x.id + " - " + x.switchReason + "\n"
                )}`,
                parameters: z.object({
                    newContextId: z.enum([currentContextId, ...context.availableContexts.map((x) => x.id)]).describe("The context to switch to."),
                }),
                execute: async ({ newContextId }) => {
                    // clear form data
                    formData = {};
                    contextId = newContextId;
                    stream.update({ type: "form-data", data: {} });
                    stream.update({ type: "switch-context", contextId: newContextId });
                    let stepText = await setStep(1, newContextId, stream);

                    return `Switched to context: ${newContextId}
                    ${stepText}                    
                    `;
                },
            },
            submitForm: {
                description: "Submits the user formData to the server",
                parameters: z.object({}),
                execute: async () => {
                    // submit form
                    return "Form submitted OK.";
                },
            },
        },
    });

    // check if it generated a tool call

    let newMessages: Message[] = [];

    // response message here is just for easy debug and printing
    let printResponseMessage: Message = { coreMessage: { role: "assistant", content: "" }, toolCall: false };

    for await (const delta of fullStream) {
        if (delta.type === "text-delta") {
            printResponseMessage.coreMessage.content += delta.textDelta;
            stream.update(delta.textDelta);
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
        stream.update(addedMessages);
        try {
            await streamResponse(provider, stream, [...messages, ...newMessages], formData, contextId, false);
        } catch (e) {}
    }

    printMessage(printResponseMessage);

    if (debug) console.log(`------ END ${currentContextId} ------`);

    // feed the result of tool calls to the
    if (closeStream) {
        stream.done();
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
    streamResponse(openAiProvider, stream, messages, formData, contextId, true);

    return { output: stream.value };
}
