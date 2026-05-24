"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { verifyEmailAction } from "./actions";
import Link from "next/link";
import { Button } from "@/components/ui/button";

function VerifyEmailContent() {
    const searchParams = useSearchParams();
    const [title, setTitle] = useState("Email verification");
    const [message, setMessage] = useState("Verifying your email...");
    const [detail, setDetail] = useState<string | null>(null);
    const [error, setError] = useState(false);
    const [continueHref, setContinueHref] = useState("/");
    const [isResolved, setIsResolved] = useState(false);
    const processedTokenRef = useRef<string | null>(null);

    useEffect(() => {
        const token = searchParams.get("token");

        if (token && processedTokenRef.current === token) {
            return;
        }

        if (token) {
            processedTokenRef.current = token;
            verifyEmailAction(token)
                .then((response) => {
                    if (response.success) {
                        setTitle("Email verified");
                        setMessage(response.message || "Email verified");
                        setDetail(
                            "Your email address has been verified. Your Kamooni profile is still unverified until you complete your profile and request member verification.",
                        );
                        setContinueHref(response.handle ? `/circles/${response.handle}` : "/");
                        setError(false);
                        setIsResolved(true);
                    } else {
                        setTitle("Email verification");
                        setMessage(
                            response.message || "Failed to verify your email. The email verification link may be invalid or expired.",
                        );
                        setDetail(null);
                        setContinueHref(response.handle ? `/circles/${response.handle}` : "/");
                        setError(true);
                        setIsResolved(true);
                    }
                })
                .catch(() => {
                    setTitle("Email verification");
                    setMessage("An unexpected error occurred. Please try again later.");
                    setDetail(null);
                    setError(true);
                    setIsResolved(true);
                });
        } else {
            setTitle("Email verification");
            setMessage("No email verification token was found. Please check the link or request a new one.");
            setDetail(null);
            setError(true);
            setIsResolved(true);
        }
    }, [searchParams]);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 dark:bg-gray-900">
            <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md dark:bg-gray-800">
                <h1 className="mb-6 text-center text-2xl font-semibold text-gray-900 dark:text-white">{title}</h1>
                <p className={`text-center ${error ? "text-red-500" : "text-green-500"}`}>{message}</p>
                {detail && (
                    <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                        {detail}
                    </p>
                )}
                {isResolved && (
                    <div className="mt-6 text-center">
                        <Button asChild>
                            <Link href={continueHref}>Continue to my profile</Link>
                        </Button>
                    </div>
                )}
                {error && message.includes("expired") && (
                    <div className="mt-4 text-center">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            If your email verification link has expired, you can request a new verification email from
                            your profile settings or by attempting to log in.
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
