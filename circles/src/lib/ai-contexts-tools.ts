import { CoreSystemMessage, CoreTool } from "ai";
import {
    AiContextTool,
    AiContext,
    ContextInfo,
    InputProvider,
    Message,
    registrationFormSchema,
    RegistrationFormType,
    AuthData,
} from "../models/models";
import { z } from "zod";
import { aiContexts } from "./ai-contexts";
import { createUser, generateUserToken } from "./auth";

export const getContextTools = (c: ContextInfo): Record<string, CoreTool<any, any>> => {
    return aiContextsTools[c.contextId](c);
};

export const getContextSystemMessage = (c: ContextInfo) => {
    let context = c.context;
    let formData = c.formData;

    const intent = context.intent;
    let content = "";
    let preface = `You are an AI assistant that helps the user ${intent}. You are on the Circles platform, a social media platform for change-makers. Guide the user through the process, personalize the experience and be encouraging.`;
    let steps = "";
    if (context.steps.length > 0) {
        steps = "\n\nHere are the steps:\n";
        context.steps.forEach((step) => {
            steps += `${step.stepNumber}: ${step.description}\n`;
        });
    }
    let formDataString = "";
    if (formData) {
        formDataString = `\n\nWe currently have the following formData, do not overwrite any value without user confirming it:\n${JSON.stringify(formData)}`;
    }
    let important = `\n\nImportant: 
    - Make sure to call the switchContext function if the user intentions are aligned with a different context than the current one.
    ${context.availableContexts.length > 0 ? c.context.availableContexts.map((x) => "    - " + x.id + " - " + x.switchReason + "\n").join("") : ""}    
    - Make sure to call the updateFormData function every time user gives input, to update the formData with new information.
    - Make sure to call the initiateStep function every time you start a new step in the form to receive detailed information on how to guide the user through the step.`;

    let formSchema = "";
    if (context.formSchema) {
        formSchema = `\n\nThis is the formData schema:\n${context.formSchema}`;
    }

    content = preface + steps + formDataString + formSchema + important;

    let systemMessage: CoreSystemMessage = {
        role: "system",
        content: content,
    };
    return systemMessage;
};

export async function setStep(stepNumber: number, contextId: string, stream: any): Promise<string> {
    let context = aiContexts[contextId];
    let stepDetails = context.steps.find((x) => x.stepNumber === stepNumber);
    if (!stepDetails) {
        return `Step ${stepNumber} not found in context ${contextId}`;
    }
    if (stepDetails.inputProvider) {
        stream.update(stepDetails.inputProvider);
    } else {
        // clear any input provider
        stream.update({ type: "input-provider", inputType: "none" });
    }
    if (stepDetails.generateInputProviderInstructions) {
        // call openAI to get input provider
    }

    // initiate step
    return `Step initiated: ${stepNumber}
   Instructions: ${stepDetails.instructions}`;
}

export const getSmartFormTools = (c: ContextInfo, customTools?: any): Record<string, CoreTool<any, any>> => {
    return {
        updateFormData: {
            description: "Updates the formData with new information",
            parameters: z.object({
                key: z.string().describe("The field to update in the formData"),
                value: z.string().describe("The value to update the field with"),
            }),
            execute: async ({ key, value }: any): Promise<string> => {
                // update formData
                c.formData[key] = value;
                c.stream.update({ type: "form-data", data: c.formData });
                return "Form value updated.";
            },
        },
        initiateStep: {
            description:
                "Initiates a new step in the form to receive detailed information on how to guide the user through the step",
            parameters: z.object({
                step: z.number().describe("The step to initiate"),
            }),
            execute: async ({ step }: any): Promise<string> => {
                // get step details from context
                return await setStep(step, c.contextId, c.stream);
            },
        },
        switchContext: {
            description: `Switches the conversation to a different context. Here are the available contexts:\n ${c.context.availableContexts.map(
                (x) => x.id + " - " + x.switchReason + "\n",
            )}`,
            parameters: z.object({
                newContextId: z
                    .enum([c.currentContextId, ...c.context.availableContexts.map((x) => x.id)])
                    .describe("The context to switch to."),
            }),
            execute: async ({ newContextId }: any): Promise<string> => {
                // clear form data
                c.formData = {};
                c.contextId = newContextId;
                c.stream.update({ type: "form-data", data: {} });
                c.stream.update({ type: "switch-context", contextId: newContextId });
                let stepText = await setStep(1, newContextId, c.stream);

                return `Switched to context: ${newContextId}
                ${stepText}                    
                `;
            },
        },
        submitForm: {
            description: "Submits the user formData to the server",
            parameters: z.object({}),
            execute: async () => {
                return "Form submission not implemented.";
            },
        },
        ...customTools,
    };
};

export const aiContextsTools: { [key: string]: (c: ContextInfo) => Record<string, CoreTool<any, any>> } = {
    "logged-out-welcome": getSmartFormTools,
    "login-form": (c: ContextInfo) =>
        getSmartFormTools(c, {
            submitForm: {
                description: "Submits the login form to the server",
                parameters: z.object({}),
                execute: async () => {
                    // Custom registration logic
                    // Example: Save the form data to the database
                    // await saveToDatabase(c.formData);
                    return "Login form submission not implemented";
                },
            },
        }),
    "register-form": (c: ContextInfo) =>
        getSmartFormTools(c, {
            submitForm: {
                description: "Submits the registration form to the server",
                parameters: registrationFormSchema,
                execute: async (registrationFormData: RegistrationFormType) => {
                    // register the user
                    try {
                        // validate the form data
                        let user = await createUser(
                            registrationFormData.name,
                            registrationFormData.type,
                            registrationFormData.email,
                            registrationFormData.password,
                        );

                        // generate and sign token for the user
                        let token = generateUserToken(user.did, user.email);
                        let streamMessage: AuthData = { type: "auth-data", user: user, token: token };
                        c.stream.update(streamMessage);

                        return "User registered successfully";
                    } catch (error) {
                        return JSON.stringify(error);
                    }
                },
            },
        }),
    "personalization-form": (c: ContextInfo) =>
        getSmartFormTools(c, {
            submitForm: {
                description: "Submits the personalization form to the server",
                parameters: z.object({}),
                execute: async () => {
                    // Custom registration logic
                    // Example: Save the form data to the database
                    // await saveToDatabase(c.formData);
                    return "Personalization form not implemented";
                },
            },
        }),
};
