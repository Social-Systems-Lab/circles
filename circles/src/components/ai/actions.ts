"use server";

import { generateText, streamText, generateObject, CoreMessage, CoreSystemMessage, ToolContent, CoreToolMessage, CoreAssistantMessage } from "ai";
import { StreamableValue, createStreamableValue } from "ai/rsc";
import { OpenAIProvider, createOpenAI } from "@ai-sdk/openai";
import { ServerConfigs } from "@/lib/db";
import { Message } from "@/models/models";
import { z } from "zod";

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

type SmartFormType = {
    systemMessage: (formData: any) => CoreSystemMessage;
    initialPrompt: any;
};

const loginRegisterSmartForm: SmartFormType = {
    systemMessage: (formData) => ({
        role: "system",
        content: `You are an AI assistant that helps the user to fill out a form step by step. 
        You are on the Circles platform, a social media platform for change-makers.
        Guide the user through each step of the form, validate their input, and provide feedback.
        
        Here are the steps for the registration form:
        1. Choose account type (user or organization)*
        2. Enter name or organization name*
        3. Enter email address*
        4. Create a password*
        5. Choose a unique handle*
        6. Provide a short description
        7. Upload a profile picture
        8. Upload a cover picture
        9. Ask the user some questions and use the answers to generate profile description.

        Here are the steps for the login form:
        1. Provide email address
        2. Provide password
        
        This is the form data schema:
        export const registrationFormSchema = z.object({
            type: z.enum(["user", "organization"]).describe("Account type"),
            name: z.string().describe("User's name, nickname or if organization the organization's name"),
            email: z.string().email().describe("Email address"),
            password: passwordSchema.describe("Password"),
            handle: handleSchema.describe(
                "Unique handle that will identify the account on the platform, e.g. a nickname or organisation name. May consist of lowercase letters, numbers and underscore."
            ),
            description: z.string().optional().describe("Short description of the user or organization"),
            picture: z.string().optional().describe("URL to profile picture"),
            cover: z.string().optional().describe("URL to cover picture"),
            content: z.string().optional().describe("Profile content that describes the user or organization in more detail"),
        });

        We currently have the following formData, do not overwrite any value without user confirming it:
        ${JSON.stringify(formData)}

        Important:
        - Make sure to call the updateFormData function every time user gives input, to update the formData with new information.
        - Make sure to call the provideInputOptions function every time you ask for user input to enhance and make it easier for the user, the most common is to provide a list of choices for text input.
        - Make sure to call the initiateStep function every time you start a new step in the form to receive detailed information on how to guide the user through the step.
        `,
    }),

    initialPrompt: {
        type: "Assistant",
        text: "Hi there! I'm your automated assistant. I'm here to help you join the Circles platform and ease the process. Do you have an account?",
        options: ["Yes, I have an account", "I want to create an account", "Why should I join?"],
    },
};

async function streamResponse(provider: OpenAIProvider, stream: any, messages: Message[], smartForm: SmartFormType, formData: any, closeStream: boolean) {
    let coreMessages = [smartForm.systemMessage(formData), ...messages.map((x) => x.coreMessage)];
    console.log("formData", formData);
    console.log("coreMessages", coreMessages);

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

                    return "Form value updated, please prompt the user for the next step in the process";
                },
            },
            provideInputOptions: {
                description: "Provides the user with additional convenient input options to help the user respond to questions besides the regular text input",
                parameters: z.object({
                    type: z
                        .enum(["options", "date-picker", "email", "file-upload", "password", "submit-form"])
                        .describe(
                            "Input type. 'options' - provides the user with a list of choices to select from. 'date-picker' - for choosing dates. 'email' - email input that checks if email exists. 'file-upload' - for uploading files such as profile picture. 'password' - for secure password entry. 'submit-form' - will submit the form to the server, this can be done once all required fields are provided."
                        ),
                    choices: z
                        .array(z.string())
                        .optional()
                        .describe(
                            "The text for each choice to provide to the user if it's options input. Please use human readable text for each that expresses the option from the user's perspective, e.g. 'I have an account' if it's to answer yes to if the user has an account."
                        ),
                }),
                execute: async ({ type, choices }) => {
                    console.log("provideInputOptions");
                    console.log(type, choices);
                    stream.update({ type: "input-provider", inputType: type, data: choices });
                    return `${type} presented to user.`;
                },
            },
            initiateStep: {
                description: "Initiates a new step in the form to receive detailed information on how to guide the user through the step",
                parameters: z.object({
                    step: z.number().describe("The step to initiate"),
                }),
                execute: async ({ step }) => {
                    console.log("initiateStep");
                    console.log(step);

                    // initiate step
                    return `Step initiated: ${step}`;
                },
            },
        },
    });

    // check if it generated a tool call

    let newMessages: Message[] = [];

    for await (const delta of fullStream) {
        if (delta.type === "text-delta") {
            stream.update(delta.textDelta);
        } else if (delta.type === "tool-call") {
            if (shouldContinueGenerating(delta)) {
                let coreToolCallMessage: CoreAssistantMessage = { role: "assistant", content: [delta] };
                newMessages.push({ coreMessage: coreToolCallMessage });
            }
            console.log("tool-call", delta.toolName);
        } else if (delta.type === "tool-result") {
            if (shouldContinueGenerating(delta)) {
                let coreToolMessage: CoreToolMessage = { role: "tool", content: [delta] };
                newMessages.push({ coreMessage: coreToolMessage });
            }
            console.log("tool-result", delta.result);
        }
    }

    // if we have tool results we make another call to get more responses
    if (newMessages.length > 0) {
        try {
            await streamResponse(provider, stream, [...messages, ...newMessages], smartForm, formData, false);
        } catch (e) {}
    }

    // feed the result of tool calls to the
    if (closeStream) {
        stream.done();
    }
}

function shouldContinueGenerating(delta: any) {
    if (delta.type === "tool-call" || delta.type === "tool-result") {
        if (delta.toolName === "updateFormData") {
            return true;
        }
        if (delta.toolName === "provideInputOptions") {
            return delta.args.inputType === "submit-form";
        }
    }
    return true;
}

export async function getStreamedAnswer(messages: Message[], formData: any) {
    let smartForm = loginRegisterSmartForm;
    console.log("getStreamedAnswer");

    // get openaikey from db
    const serverConfig = await ServerConfigs.findOne({});
    const openaiKey = serverConfig?.openaiKey;
    if (!openaiKey) {
        throw new Error("OpenAI key not found");
    }

    let openAiProvider = createOpenAI({ apiKey: openaiKey });
    const stream = createStreamableValue<StreamableValue>("");
    streamResponse(openAiProvider, stream, messages, smartForm, formData, true);

    return { output: stream.value };
}
