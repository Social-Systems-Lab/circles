import { InputProvider } from "./models";

export type AiWizardContext = {
    id: string;
    title: string;
    description: string;
    defaultStep?: number;
    instructions?: string;
    prompt?: string;
    steps: AiWizardStep[];
    availableContexts: string[];
};

export type AiWizardStep = {
    stepNumber: number;
    description: string;
    instructions?: string;
    prompt?: string;
    nextStep?: number;
    inputProvider?: InputProvider;
};

// TODO these can be fetched from the database
export const aiWizardContexts: { [key: string]: AiWizardContext } = {
    "logged-out-welcome": {
        id: "logged-out-welcome",
        title: "Welcome to Circles!",
        description: "Welcome screen for users who are not logged in",
        defaultStep: 1,
        steps: [
            {
                stepNumber: 1,
                description: "Welcome the user",
                prompt: "Hi there! I'm your automated assistant. I'm here to help you join the Circles platform and ease the process. Do you have an account?",
                inputProvider: {
                    type: "input-provider",
                    inputType: "options",
                    data: ["Yes, I have an account", "I want to create an account", "Why should I join?"],
                },
            },
        ],
        availableContexts: ["login-form", "register-form"],
    },
    "login-form": {
        id: "login-form",
        title: "Login to Circles",
        description: "Login form for existing users",
        steps: [
            {
                stepNumber: 1,
                description: "Ask for email address",
                instructions: "Please provide your email address.",
            },
            {
                stepNumber: 2,
                description: "Ask for password",
                instructions: "Please provide your password.",
            },
        ],
        availableContexts: ["logged-out-welcome", "register-form"],
    },
    "register-form": {
        id: "register-form",
        title: "Register for Circles",
        description: "Registration form for new users",
        steps: [
            {
                stepNumber: 1,
                description: "Choose account type",
                instructions: "Do you want to register as a user or an organization?",
            },
            {
                stepNumber: 2,
                description: "Enter name or organization name",
                instructions: "Please enter your name or the name of your organization.",
            },
            {
                stepNumber: 3,
                description: "Enter email address",
                instructions: "Please enter your email address.",
            },
            {
                stepNumber: 4,
                description: "Create a password",
                instructions: "Please create a password.",
            },
            {
                stepNumber: 5,
                description: "Choose a unique handle",
                instructions: "Please choose a unique handle.",
            },
            {
                stepNumber: 6,
                description: "Provide a short description (optional)",
                instructions: "Please provide a short description (optional).",
            },
            {
                stepNumber: 7,
                description: "Upload a profile picture (optional)",
                instructions: "Please upload a profile picture (optional).",
            },
            {
                stepNumber: 8,
                description: "Upload a cover picture (optional)",
                instructions: "Please upload a cover picture (optional).",
            },
            {
                stepNumber: 9,
                description: "Generate profile description",
                instructions: "Please answer the following questions to help us generate your profile description.",
            },
        ],
        availableContexts: ["logged-out-welcome", "login-form"],
    },
};
