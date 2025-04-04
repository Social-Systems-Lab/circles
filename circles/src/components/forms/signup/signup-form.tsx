"use client";

import React, { useState } from "react";
import { Control, Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { submitSignupFormAction } from "./actions";
import { useAtom } from "jotai";
import { authInfoAtom, userAtom } from "@/lib/data/atoms";
import { DynamicAutoHandleField } from "../dynamic-field";

// Zod schema based on signupFormSchema
const signupValidationSchema = z.object({
    name: z.string().min(1, "Name is required"),
    handle: z
        .string()
        .min(3, "Handle must be at least 3 characters")
        .regex(/^[a-z0-9-]+$/, "Handle can only contain lowercase letters, numbers, and hyphens"),
    _email: z.string().email("Invalid email address"),
    _password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignupFormData = z.infer<typeof signupValidationSchema>;

export function SignupForm(): React.ReactElement {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [, setUser] = useAtom(userAtom);
    const [, setAuthInfo] = useAtom(authInfoAtom);
    const searchParams = useSearchParams();

    const form = useForm<SignupFormData>({
        resolver: zodResolver(signupValidationSchema),
        defaultValues: {
            name: "",
            handle: "",
            _email: "",
            _password: "",
        },
    });

    const onSubmit = async (data: SignupFormData) => {
        setIsSubmitting(true);
        try {
            // Call the onSubmit method from the imported action object
            const result = await submitSignupFormAction(data);
            if (result.success) {
                toast({
                    title: "Signup Successful",
                    description: "Welcome! Redirecting you now...",
                });

                // set logged in user and authenticate status
                setUser(result.data.user);
                setAuthInfo((prev) => ({ ...prev, authStatus: "authenticated" }));

                // redirect to requested page
                let redirectUrl = searchParams?.get("redirectTo") ?? `/circles/${result.data.user.handle}`;
                router.push(redirectUrl);
            } else {
                toast({
                    title: "Signup Failed",
                    description: result.message || "An error occurred during signup.",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "An unexpected error occurred.",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="formatted w-full space-y-6">
                <h2 className="text-center text-2xl font-semibold">Sign up</h2>
                <p className="text-center text-sm text-muted-foreground">Create an account to get started.</p>

                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input placeholder="Your Name" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Controller
                    name="handle"
                    control={form.control as unknown as Control}
                    render={({ field }) => (
                        <DynamicAutoHandleField
                            field={{
                                name: "handle",
                                type: "text",
                                label: "Handle",
                                placeholder: "handle",
                                description: {
                                    circle: "Choose a unique handle that will identify the circle on the platform.",
                                    user: "Choose a unique handle that will identify you on the platform.",
                                },
                                required: true,
                            }}
                            formField={field}
                            control={form.control as unknown as Control}
                        />
                    )}
                />
                <FormField
                    control={form.control}
                    name="_email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                                <Input type="email" placeholder="you@example.com" {...field} autoComplete="email" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="_password"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                                <Input type="password" placeholder="********" {...field} autoComplete="new-password" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting ? "Signing up..." : "Sign up"}
                </Button>

                <div className="pb-6 text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link href="/login" className="underline hover:text-primary">
                        Log in
                    </Link>
                </div>
            </form>
        </Form>
    );
}
