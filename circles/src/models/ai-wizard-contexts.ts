import { CoreSystemMessage } from "ai";
import { InputProvider, Message } from "./models";

export type AvailableContext = {
    id: string;
    switchReason: string;
};

export type AiWizardContext = {
    id: string;
    title: string;
    intent: string;
    description: string;
    formSchema?: string;
    defaultStep?: number;
    instructions?: string;
    prompt?: string;
    steps: AiWizardStep[];
    availableContexts: AvailableContext[];
};

export type AiWizardStep = {
    stepNumber: number;
    description: string;
    instructions?: string;
    prompt?: string;
    nextStep?: number;
    inputProvider?: InputProvider;
};

export const getContextSystemMessage = (context: AiWizardContext, formData: FormData) => {
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

// TODO these can be fetched from the database
export const aiWizardContexts: { [key: string]: AiWizardContext } = {
    "logged-out-welcome": {
        id: "logged-out-welcome",
        title: "Welcome to Circles!",
        description: "Welcome screen for users who are not logged in",
        intent: "learn about and be inspired to join the Circles platform",
        defaultStep: 1,
        steps: [
            {
                stepNumber: 1,
                description: "Welcome the user",
                prompt: "Hi there! I'm your automated assistant. I'm here to help you join the Circles platform and ease the process. Do you have an account?",
                inputProvider: {
                    type: "input-provider",
                    inputType: "suggestions",
                    data: ["Yes, I have an account", "I want to create an account", "Why should I join?"],
                },
            },
        ],
        availableContexts: [
            {
                id: "login-form",
                switchReason: "Switch to this context to initiate log in process.",
            },
            {
                id: "register-form",
                switchReason: "Switch to this context to initiate register a new account process.",
            },
        ],
    },
    "login-form": {
        id: "login-form",
        title: "Login to Circles",
        description: "Login form for existing users",
        intent: "log in to the Circles platform",
        steps: [
            {
                stepNumber: 1,
                description: "Ask for email address",
                instructions: "Please provide your email address.",
                prompt: "Let's create a new account! TODO",
            },
            {
                stepNumber: 2,
                description: "Ask for password",
                instructions: "Please provide your password.",
            },
        ],
        availableContexts: [
            {
                id: "logged-out-welcome",
                switchReason: "Switch to this context if log in process is to be cancelled and register new account process is not to be initiated.",
            },
            {
                id: "register-form",
                switchReason: "Switch to this context if log in process is to be cancelled and to initiate the register new account process.",
            },
        ],
    },
    "register-form": {
        id: "register-form",
        title: "Register for Circles",
        description: "Registration form for new users",
        intent: "register a new account on the Circles platform",
        formSchema: `z.object({
            type: z.enum(["user", "organization"]).describe("Account type"),
            email: z.string().email().describe("Email address"),
            password: passwordSchema.describe("Password"),
        });`,

        defaultStep: 1,
        steps: [
            {
                stepNumber: 1,
                description: "Choose account type",
                instructions:
                    "Prompt the user to choose account type. Make sure to update the formData with updateFormData when the user has made their choice.",
                prompt: "Let's create a new account! Do you want to register as a user or an organization?",
                inputProvider: {
                    type: "input-provider",
                    inputType: "suggestions",
                    data: ["User", "Organization", "Can you help me decide?"],
                },
            },
            {
                stepNumber: 2,
                description: "Enter email credential",
                instructions: "Instruct the user to enter email that will be used to log into the account.",
            },
            {
                stepNumber: 3,
                description: "Enter password",
                instructions:
                    "Instruct the user to choose a password. After the password is submitted, call 'submitForm' to submit the form and if registration is successful switch to the 'personlization-form' context.",
            },
        ],
        availableContexts: [
            {
                id: "logged-out-welcome",
                switchReason: "Switch to this context if registration process is to be cancelled and a log in to existing process is not to be initiated.",
            },
            {
                id: "login-form",
                switchReason: "Switch to this context if registration process is to be cancelled and to initiate log in to existing account process.",
            },
            {
                id: "personalization-form",
                switchReason: "Switch to this context to initiate personalization process after the user has registered their account.",
            },
        ],
    },

    "personalization-form": {
        id: "personalization-form",
        title: "Personalize your account",
        description: "Personalization form for new users",
        intent: "personalize their account on the Circles platform",
        formSchema: `z.object({
            name: z.string().describe("User's name, nickname or if organization the organization's name"),
            handle: handleSchema.describe(
                "Unique handle that will identify the account on the platform, e.g. a nickname or organisation name. May consist of lowercase letters, numbers and underscore."
            ),
            description: z.string().optional().describe("Short description of the user or organization"),
            picture: z.string().optional().describe("URL to profile picture"),
            cover: z.string().optional().describe("URL to cover picture"),
            content: z.string().optional().describe("Profile content that describes the user or organization in more detail"),
        });`,

        defaultStep: 1,
        steps: [
            {
                stepNumber: 1,
                description: "Enter name or organization name",
                instructions: "Instruct the user to enter their name or organization name depending on what account type they have chosen.",
            },
            {
                stepNumber: 2,
                description: "Choose a unique handle",
                instructions:
                    "Instruct the user to choose a unique handle. Important: call 'presentSuggestions' with some suggested handles based on the user's input so far that will be presented below your response.",
            },
            {
                stepNumber: 3,
                description: "Upload a profile picture",
                instructions: "Please upload a profile picture.",
            },
            {
                stepNumber: 4,
                description: "Upload a cover picture",
                instructions: "Please upload a cover picture.",
            },
            {
                stepNumber: 5,
                description: "Generate profile description",
                instructions: "Please answer the following questions to help us generate your profile description.",
            },
            {
                stepNumber: 6,
                description: "Provide a short description",
                instructions: "Please provide a short description.",
            },
        ],
        availableContexts: [
            {
                id: "default",
                switchReason: "Switch to this context when the personalization process is done.",
            },
        ],
    },
};
