import { AiContext } from "../models/models";

export const aiContexts: { [key: string]: AiContext } = {
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
                prompt: "Hi and welcome to Circles, your platform for creating change. If you're new here, start your journey by creating your account. If you're returning, welcome back! Ready to dive back and continue making an impact?",
                instructions:
                    "Welcome the user and ask them if they have an account or if they want to create one. Switch to the appropriate context based on the user's answer.",
                inputProvider: {
                    type: "input-provider",
                    inputType: "suggestions",
                    data: ["I have an account", "I want to create an account", "Why should I join?"],
                },
            },
        ],
        availableContexts: [
            {
                id: "login-form",
                switchReason: "Switch to this context if user intends to log in.",
            },
            {
                id: "register-form",
                switchReason: "Switch to this context if user intends to register a new account.",
            },
        ],
        icon: "FaDoorOpen",
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
                prompt: "Let's create a new account!",
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
                switchReason:
                    "Switch to this context if log in process is to be cancelled and register new account process is not to be initiated.",
            },
            {
                id: "register-form",
                switchReason:
                    "Switch to this context if log in process is to be cancelled and to initiate the register new account process.",
            },
        ],
        icon: "PiSignInBold",
    },
    "register-form": {
        id: "register-form",
        title: "Register for Circles",
        description: "Registration form for new users",
        intent: "register a new account on the Circles platform",
        formSchema: `z.object({
            type: z.enum(["user", "organization"]).describe("Account type"),
            email: z.string().email().describe("Email address"),
            password: z.string().min(8).describe("Password containing at least 8 characters"),
            name: z.string().describe("User's full name or if organization the organization's name"),
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
                description: "Enter name or organization name",
                instructions:
                    "Instruct the user to enter their name or organization name depending on what account type they have chosen.",
            },
            {
                stepNumber: 4,
                description: "Enter password",
                instructions:
                    "Instruct the user to choose a password. After the password is submitted, call 'submitForm' to submit the form and if registration is successful switch to the 'personlization-form' context.",
            },
        ],
        availableContexts: [
            {
                id: "logged-out-welcome",
                switchReason:
                    "Switch to this context if registration process is to be cancelled and a log in to existing process is not to be initiated.",
            },
            {
                id: "login-form",
                switchReason:
                    "Switch to this context if registration process is to be cancelled and to initiate log in to existing account process.",
            },
            {
                id: "personalization-form",
                switchReason:
                    "Switch to this context to initiate personalization process after the user has registered their account.",
            },
        ],
        icon: "IoCreate",
    },
    "personalization-form": {
        id: "personalization-form",
        title: "Personalize your account",
        description: "Personalization form for new users",
        intent: "personalize their account on the Circles platform",
        formSchema: `z.object({
            handle: handleSchema.describe(
                "Unique handle that will identify the account on the platform, e.g. a nickname or organisation name. May consist of lowercase letters, numbers and underscore."
            ),
            picture: z.string().optional().describe("URL to profile picture"),
            cover: z.string().optional().describe("URL to cover picture"),
            answer_1: z.string().optional().describe("User's answer to the first personlization question"),
            answer_2: z.string().optional().describe("User's answer to the second personlization question"),
            answer_3: z.string().optional().describe("User's answer to the third personlization question"),
            content: z.string().optional().describe("Profile content that will be generated based on the users answers that describes the user or organization in more detail. This will be presented on the user's profile to entice people to join or connect with the user or organization."),
            description: z.string().optional().describe("Short description that summarizes the essence and 'vibe' of the user or organization."),
        });`,

        defaultStep: 1,
        steps: [
            {
                stepNumber: 1,
                description: "Ask the user the first personlization question",
                instructions:
                    "Inform the user briefly about the process and ask the user the first personlization question that the relate to the ethos of the platform. The first one being 'What are you fighting for?', personalize the question if possible.",
            },
            {
                stepNumber: 2,
                description: "Ask the user the second personlization question",
                instructions:
                    "Offer a quick feedback on the user's answer, try to mention that there are many others that share the same vision. Then ask the second personalization question and here you can be creative in what the question is.",
            },
            {
                stepNumber: 3,
                description: "Ask the user the third and final personlization question",
                instructions:
                    "Offer a quick feedback on the user's previous answers, connect the two. Then ask the final personalization question and here you can be creative in what the question is.",
            },
            {
                stepNumber: 4,
                description: "Generate profile description",
                instructions:
                    "Generate long profile content and short description based on all the information given so far. The long profile content will be presented on the user's profile to entice people to join or connect with the user or organization. The short desciption is at a glance description that summarizes the essence and 'vibe' of the user or organization. And then ask if anything should be changed and if not proceed to the next step.",
            },
            {
                stepNumber: 5,
                description: "Choose cover picture",
                instructions: "Instruct the user that a cover image has been generated for them.",
            },
            {
                stepNumber: 6,
                description: "Upload a profile picture",
                instructions: "Prompt the user to upload a profile picture as a cherry on the cake.",
            },
            {
                stepNumber: 7,
                description: "Choose a unique handle",
                instructions:
                    "Prompt the user to choose a unique handle (suggestions will be presented in a panel below so no need to mention suggestions in your response).",
                generateInputProviderInstructions: "Generate 4 suggested handles for the user to choose from.",
            },
        ],
        availableContexts: [
            {
                id: "default",
                switchReason: "Switch to this context when the personalization process is done.",
            },
        ],
        icon: "MdAccountCircle",
    },
};
