// otp-login.tsx

"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { invoke } from "@tauri-apps/api/core";
import { Lock } from "lucide-react";

interface OTPLoginProps {
    identity: { name: string; did: string; encrypted_key: string; salt: string; iv: string; image?: string };
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    onFailure: () => void;
}

const OTPLogin: React.FC<OTPLoginProps> = ({ identity, isOpen, onClose, onSuccess, onFailure }) => {
    const [otp, setOtp] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [authResult, setAuthResult] = useState<"success" | "failure" | null>(null);

    useEffect(() => {
        if (otp.length === 6) {
            handleAuthenticate();
        }
    }, [otp]);

    const handleAuthenticate = async () => {
        setIsLoading(true);
        setAuthResult(null);

        try {
            console.log(
                "Authenticating",
                JSON.stringify({
                    did: identity.did,
                    pin: otp,
                    encryptedKey: identity.encrypted_key,
                    encryptedKeyLength: identity.encrypted_key.length,
                    salt: identity.salt,
                    iv: identity.iv,
                })
            );

            // Call the backend to authenticate using the DID, encrypted key, salt, iv, and OTP (PIN)
            const isAuthenticated = await invoke<boolean>("authenticate_identity", {
                did: identity.did,
                pin: otp,
                encryptedKey: identity.encrypted_key,
                salt: identity.salt,
                iv: identity.iv,
            });

            setAuthResult(isAuthenticated ? "success" : "failure");
            setIsLoading(false);

            if (isAuthenticated) {
                setTimeout(() => {
                    onSuccess();
                }, 2000);
            } else {
                setTimeout(() => {
                    onFailure();
                }, 2000);
            }
        } catch (error) {
            console.error("Authentication failed:", error);
            setAuthResult("failure");
            setIsLoading(false);
            setTimeout(() => {
                onFailure();
            }, 2000);
        }
    };

    const resetOTP = () => {
        setOtp("");
        setAuthResult(null);
    };

    return (
        <div className="flex flex-col items-center justify-center">
            <div className="flex items-center justify-center mb-4">
                <Avatar className="h-12 w-12 mr-3">
                    <AvatarImage src={identity.image || "/images/default-user-picture.png"} alt={`${identity.name}'s profile picture`} />
                    <AvatarFallback>{identity.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex items-center">
                    <Lock className="h-6 w-6 text-gray-500 mr-2" />
                    <h1 className="text-xl font-bold text-center">Enter profile PIN</h1>
                </div>
            </div>
            <div className="h-32 flex items-center justify-center">
                {!isLoading && authResult === null ? (
                    <InputOTP value={otp} onChange={(value) => setOtp(value)} maxLength={6} autoFocus>
                        <InputOTPGroup>
                            {Array.from({ length: 6 }).map((_, index) => (
                                <InputOTPSlot key={index} index={index} />
                            ))}
                        </InputOTPGroup>
                    </InputOTP>
                ) : (
                    <div className="w-32 h-32 relative">
                        <svg className={`${isLoading ? "animate-spin-slow" : ""}`} viewBox="0 0 150 150">
                            <circle
                                className={`path circle ${isLoading ? "loading" : ""} ${authResult ? "complete" : ""}`}
                                fill="none"
                                stroke={authResult === "success" ? "#73AF55" : authResult === "failure" ? "#D06079" : "#D1D5DB"}
                                strokeWidth="4"
                                strokeLinecap="round"
                                cx="75"
                                cy="75"
                                r="60"
                            />
                            {authResult === "success" && (
                                <polyline
                                    className="path check"
                                    fill="none"
                                    stroke="#73AF55"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    strokeMiterlimit="10"
                                    points="45,75 65,95 110,50"
                                />
                            )}
                            {authResult === "failure" && (
                                <>
                                    <line
                                        className="path line"
                                        fill="none"
                                        stroke="#D06079"
                                        strokeWidth="4"
                                        strokeLinecap="round"
                                        strokeMiterlimit="10"
                                        x1="45"
                                        y1="45"
                                        x2="105"
                                        y2="105"
                                    />
                                    <line
                                        className="path line"
                                        fill="none"
                                        stroke="#D06079"
                                        strokeWidth="4"
                                        strokeLinecap="round"
                                        strokeMiterlimit="10"
                                        x1="105"
                                        y1="45"
                                        x2="45"
                                        y2="105"
                                    />
                                </>
                            )}
                        </svg>
                    </div>
                )}
            </div>
            {authResult === "success" && <p className="text-center mt-4 text-lg text-green-600">Authenticated Successfully!</p>}
            {authResult === "failure" && (
                <>
                    <p className="text-center mt-4 text-lg text-red-600">Authentication Failed. Try Again!</p>
                    <Button onClick={resetOTP} className="w-full mt-4">
                        Try Again
                    </Button>
                </>
            )}
            <Button onClick={onClose} className="w-full mt-4">
                Cancel
            </Button>

            <style>{`
    .path {
        stroke-dasharray: 388;
        stroke-dashoffset: 388;
    }
    .circle {
        transition: stroke 0.3s ease;
    }
    .circle.loading {
        animation: dash 1s ease-in-out forwards;
    }
    .circle.complete {
        animation: complete 0.3s ease-in-out forwards;
    }
    .animate-spin-slow {
        animation: spin 1s linear infinite;
    }
    .line {
        stroke-dashoffset: 150;
        animation: dash 0.9s 0.35s ease-in-out forwards;
    }
    .check {
        stroke-dashoffset: -100;
        animation: dash-check 0.9s 0.35s ease-in-out forwards;
    }
    @keyframes dash {
        0% {
            stroke-dashoffset: 388;
        }
        90%,
        100% {
            stroke-dashoffset: 38.8;
        }
    }
    @keyframes complete {
        to {
            stroke-dashoffset: 0;
        }
    }
    @keyframes dash-check {
        0% {
            stroke-dashoffset: -100;
        }
        100% {
            stroke-dashoffset: 900;
        }
    }
    @keyframes spin {
        100% {
            transform: rotate(360deg);
        }
    }
`}</style>
        </div>
    );
};

export default OTPLogin;
