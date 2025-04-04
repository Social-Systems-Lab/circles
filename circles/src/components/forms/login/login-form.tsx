"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginFormAction } from "./login-form-action"; // Import the action object

// Zod schema based on loginFormSchema
const loginValidationSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"), // Basic check, server handles actual auth
});

type LoginFormData = z.infer<typeof loginValidationSchema>;

export function LoginForm(): React.ReactElement {
    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<LoginFormData>({
        resolver: zodResolver(loginValidationSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    });

    const onSubmit = async (data: LoginFormData) => {
        setIsSubmitting(true);
        try {
            // Call the onSubmit method from the imported action object
            const result = await loginFormAction.onSubmit(data);
            if (result.success) {
                toast({
                    title: "Login Successful",
                    description: "Welcome back!",
                });
                // Redirect to home or dashboard after login
                router.push("/"); // Or potentially result.data.user.defaultPath or similar if available
                router.refresh(); // Force refresh to update layout/auth state
            } else {
                toast({
                    title: "Login Failed",
                    description: result.message || "Invalid email or password.",
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
            <form onSubmit={form.handleSubmit(onSubmit)} className="w-full space-y-6">
                <h2 className="text-center text-2xl font-semibold">Login</h2>
                <p className="text-center text-sm text-muted-foreground">Enter your email and password to log in.</p>

                <FormField
                    control={form.control}
                    name="email"
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
                    name="password"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                                <Input
                                    type="password"
                                    placeholder="********"
                                    {...field}
                                    autoComplete="current-password"
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <Button type="submit" disabled={isSubmitting} className="w-full">
                    {isSubmitting ? "Logging in..." : "Log in"}
                </Button>

                <div className="text-center text-sm text-muted-foreground">
                    Don&#39;t have an account?{" "}
                    <Link href="/signup" className="underline hover:text-primary">
                        Sign up here
                    </Link>
                </div>
            </form>
        </Form>
    );
}
