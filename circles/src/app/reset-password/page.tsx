"use client";

import { useState, useTransition, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { resetPassword } from "@/lib/auth/actions"; // Import the server action
import { passwordSchema, emailSchema } from "@/models/models"; // Import schemas
import { RefreshCw } from "lucide-react";
import Link from "next/link";

// Define the schema for the form using Zod
const resetPasswordFormSchema = z
    .object({
        token: z.string(), // Token will be added programmatically
        email: emailSchema,
        password: passwordSchema,
        confirmPassword: passwordSchema,
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords don't match",
        path: ["confirmPassword"], // Set the error path to confirmPassword field
    });

type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;

function ResetPasswordFormComponent() {
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const [resetSuccess, setResetSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Extract token from URL - ensure it's done client-side
    const token = searchParams.get("token") || "";

    const form = useForm<ResetPasswordFormValues>({
        resolver: zodResolver(resetPasswordFormSchema),
        defaultValues: {
            token: token, // Set token from URL
            email: "",
            password: "",
            confirmPassword: "",
        },
    });

    // Update token in form if URL changes (though unlikely on this page)
    useEffect(() => {
        form.setValue("token", token);
    }, [token, form]);

    const onSubmit = (values: ResetPasswordFormValues) => {
        setError(null); // Clear previous errors
        if (!token) {
            setError("Password reset token is missing from the URL.");
            return;
        }

        startTransition(async () => {
            try {
                // No need to send confirmPassword to the server action
                const result = await resetPassword(values.token, values.email, values.password);

                if (result.success) {
                    setResetSuccess(true);
                    toast({
                        title: "Success",
                        description: "Your password has been reset successfully.",
                    });
                    form.reset(); // Clear the form
                } else {
                    setError(result.error || "Failed to reset password.");
                    toast({
                        title: "Error",
                        description: result.error || "Failed to reset password.",
                        variant: "destructive",
                    });
                }
            } catch (err) {
                console.error("Password reset error:", err);
                setError("An unexpected error occurred. Please try again.");
                toast({
                    title: "Error",
                    description: "An unexpected error occurred.",
                    variant: "destructive",
                });
            }
        });
    };

    if (!token && !resetSuccess) {
        // Render this only after checking token client-side
        return (
            <Card className="mx-auto mt-10 max-w-md">
                <CardHeader>
                    <CardTitle>Invalid Reset Link</CardTitle>
                    <CardDescription>
                        The password reset link is missing or invalid. Please request a new one from the administrator.
                    </CardDescription>
                </CardHeader>
                <CardFooter>
                    <Button asChild className="w-full">
                        <Link href="/login">Return to Login</Link>
                    </Button>
                </CardFooter>
            </Card>
        );
    }

    if (resetSuccess) {
        return (
            <Card className="mx-auto mt-10 max-w-md">
                <CardHeader>
                    <CardTitle>Password Reset Successful</CardTitle>
                    <CardDescription>You can now log in with your new password.</CardDescription>
                </CardHeader>
                <CardFooter>
                    <Button asChild className="w-full">
                        <Link href="/login">Go to Login</Link>
                    </Button>
                </CardFooter>
            </Card>
        );
    }

    return (
        <Card className="formatted mx-auto mt-10 max-w-md">
            <CardHeader>
                <CardTitle>Reset Your Password</CardTitle>
                <CardDescription>Enter your email and new password below.</CardDescription>
            </CardHeader>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <CardContent className="space-y-4">
                    {/* Hidden token field - already set in defaultValues */}
                    <input type="hidden" {...form.register("token")} />

                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" placeholder="you@example.com" {...form.register("email")} />
                        {form.formState.errors.email && (
                            <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">New Password</Label>
                        <Input id="password" type="password" {...form.register("password")} />
                        {form.formState.errors.password && (
                            <p className="text-sm text-red-500">{form.formState.errors.password.message}</p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm New Password</Label>
                        <Input id="confirmPassword" type="password" {...form.register("confirmPassword")} />
                        {form.formState.errors.confirmPassword && (
                            <p className="text-sm text-red-500">{form.formState.errors.confirmPassword.message}</p>
                        )}
                    </div>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                </CardContent>
                <CardFooter>
                    <Button type="submit" className="w-full" disabled={isPending}>
                        {isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Reset Password
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}

// Wrap the component in Suspense because useSearchParams needs it
export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ResetPasswordFormComponent />
        </Suspense>
    );
}
