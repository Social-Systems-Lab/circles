"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";
import { requestPasswordResetAction } from "./actions"; // This action will be created next

const forgotPasswordSchema = z.object({
    email: z.string().email("Invalid email address"),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const form = useForm<ForgotPasswordFormData>({
        resolver: zodResolver(forgotPasswordSchema),
        defaultValues: {
            email: "",
        },
    });

    const onSubmit = async (data: ForgotPasswordFormData) => {
        setIsSubmitting(true);
        setSubmitted(false);
        try {
            const result = await requestPasswordResetAction(data.email);
            if (result.success) {
                toast({
                    title: "Password Reset Requested",
                    description:
                        result.message || "If an account with that email exists, a password reset link has been sent.",
                });
                setSubmitted(true); // Show success message and hide form
            } else {
                toast({
                    title: "Request Failed",
                    description: result.message || "Could not process your request. Please try again.",
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
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 dark:bg-gray-900">
            <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md dark:bg-gray-800">
                <h1 className="mb-6 text-center text-2xl font-semibold text-gray-900 dark:text-white">
                    Forgot Password
                </h1>
                {submitted ? (
                    <div className="text-center">
                        <p className="text-green-500">
                            If an account with the provided email exists, a password reset link has been sent. Please
                            check your inbox (and spam folder).
                        </p>
                        <Button asChild className="mt-6">
                            <Link href="/login">Back to Login</Link>
                        </Button>
                    </div>
                ) : (
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <p className="text-center text-sm text-muted-foreground">
                                Enter your email address and we&apos;ll send you a link to reset your password.
                            </p>
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="email"
                                                placeholder="you@example.com"
                                                {...field}
                                                autoComplete="email"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" disabled={isSubmitting} className="w-full">
                                {isSubmitting ? "Sending..." : "Send Reset Link"}
                            </Button>
                            <div className="text-center text-sm text-muted-foreground">
                                Remember your password?{" "}
                                <Link href="/login" className="underline hover:text-primary">
                                    Log in
                                </Link>
                            </div>
                        </form>
                    </Form>
                )}
            </div>
        </div>
    );
}
