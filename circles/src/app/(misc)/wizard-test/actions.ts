"use server";

import {
    LoginData,
    EmailFormType,
    loginDataSchema,
    PasswordFormType,
    passwordFormSchema,
    emailFormSchema,
} from "@/models/models";
import { ServerConfigs } from "@/lib/data/db";

type ActionResponse = {
    message?: string;
    success: boolean;
};

type CheckIfAccountExistsActionResponse = {
    accountExists: boolean;
    message?: string;
    success: boolean;
};

export async function checkIfAccountExists(data: EmailFormType): Promise<CheckIfAccountExistsActionResponse> {
    const emailData = emailFormSchema.safeParse(data);
    if (emailData.success === false) {
        return {
            success: false,
            message: "Invalid email",
            accountExists: false,
        };
    }

    // check if email is registered or not
    // TODO here we need to check with central registry if email is registered
    let accountExists = data.email === "test@gmail.com";
    return {
        accountExists: accountExists,
        success: true,
    };
}

type LoginActionResponse = {
    message?: string;
    success: boolean;
};

export async function login(data: PasswordFormType): Promise<LoginActionResponse> {
    const loginData = passwordFormSchema.safeParse(data);

    if (!loginData.success) {
        return {
            success: false,
            message: "Invalid login data",
        };
    }

    // check if password is correct
    let passwordCorrect = loginData.data.password === "testtest";
    if (!passwordCorrect) {
        return {
            success: false,
            message: "Incorrect password",
        };
    }

    // login successful
    return {
        success: true,
    };
}
