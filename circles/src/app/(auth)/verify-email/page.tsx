"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { verifyEmailAction } from "./actions"; // This action will be created next
import Link from "next/link";
import { Button } from "@/components/ui/button";

function VerifyEmailContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [message, setMessage] = useState("Verifying your email...");
    const [error, setError] = useState(false);

    useEffect(() => {
        const token = searchParams.get("token");

        if (token) {
            verifyEmailAction(token)
                .then((response) => {
                    if (response.success) {
                        setMessage(response.message || "Email verified successfully! You can now log in.");
                        setError(false);
                        // Optional: Redirect to login or dashboard after a delay
                        // setTimeout(() => {
                        //     router.push("/login");
                        // }, 3000);
                    } else {
                        setMessage(response.message || "Failed to verify email. The link may be invalid or expired.");
                        setError(true);
                    }
                })
                .catch(() => {
                    setMessage("An unexpected error occurred. Please try again later.");
                    setError(true);
                });
        } else {
            setMessage("No verification token found. Please check the link or request a new one.");
            setError(true);
        }
    }, [searchParams, router]);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 dark:bg-gray-900">
            <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md dark:bg-gray-800">
                <h1 className="mb-6 text-center text-2xl font-semibold text-gray-900 dark:text-white">
                    Email Verification
                </h1>
                <p className={`text-center ${error ? "text-red-500" : "text-green-500"}`}>{message}</p>
                {!error && message.includes("successfully") && (
                    <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                        Your email has been verified...
                    </p>
                )}
                {(error || message.includes("successfully")) && (
                    <div className="mt-6 text-center">
                        <Button asChild>
                            <Link href="/">Enter</Link>
                        </Button>
                    </div>
                )}
                {error && message.includes("expired") && (
                    <div className="mt-4 text-center">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            If your link has expired, you can request a new verification email from your profile
                            settings or by attempting to log in.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen flex-col items-center justify-center">
                    <p>Loading...</p>
                </div>
            }
        >
            <VerifyEmailContent />
        </Suspense>
    );
}
