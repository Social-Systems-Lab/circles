// create-account-wizard.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion, MotionProps } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Globe, Loader2, Smartphone } from "lucide-react";
import { ChevronRight, Shield, Key, User, Share2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAccountAction, verifySignatureAction } from "./actions";
import { AccountAndPrivateKey } from "@/models/models";
import { WebviewLog } from "./authenticator";
import { useAtom } from "jotai";
import { authInfoAtom, userAtom } from "@/lib/data/atoms";
import { LOG_LEVEL_TRACE, logLevel } from "@/lib/data/constants";
// import crypto from "crypto-browserify";

interface WelcomeStepProps {
    onNext: () => void;
}

const WelcomeStep: React.FC<WelcomeStepProps> = ({ onNext }) => (
    <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-center text-3xl font-bold tracking-tight md:text-4xl">Welcome to Circles</h1>
        <p className="text-center text-lg text-gray-600 md:text-xl">
            Your journey to a more intentional digital space begins here
        </p>
        <ul className="space-y-3 text-sm text-gray-600 md:text-base">
            <li className="flex items-start">
                <Shield className="mr-2 mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />
                <span>
                    <strong>Your Data:</strong> Take the first step toward owning your digital identity.
                </span>
            </li>
            <li className="flex items-start">
                <Key className="mr-2 mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />
                <span>
                    <strong>Your Rules:</strong> Set boundaries and choose how you connect.
                </span>
            </li>
            <li className="flex items-start">
                <User className="mr-2 mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />
                <span>
                    <strong>Your Privacy:</strong> Designed with security in mind, starting with your cryptographic
                    keys.
                </span>
            </li>
            <li className="flex items-start">
                <Share2 className="mr-2 mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />
                <span>
                    <strong>Always Free to Use:</strong> No costs unless you choose to monetize your content.
                </span>
            </li>
        </ul>
        <Button onClick={onNext} size="lg" className="w-full rounded-full bg-blue-600 text-white hover:bg-blue-700">
            Get Started
            <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
    </div>
);

interface IdentityStepProps {
    onNext: () => void;
}

const IdentityStep: React.FC<IdentityStepProps> = ({ onNext }) => (
    <div className="mx-auto max-w-md space-y-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">Your Digital Identity</h2>
        <div className="space-y-4 text-sm text-gray-600 md:text-base">
            <p>In the next steps, you&apos;ll create your basic profile. Circles is designed to provide:</p>
            <ul className="space-y-2">
                <li className="flex items-start">
                    <Smartphone className="mr-2 mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />
                    <span>A digital identity you control.</span>
                </li>
                <li className="flex items-start">
                    <Globe className="mr-2 mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />
                    <span>Secure and intentional connections.</span>
                </li>
                <li className="flex items-start">
                    <Key className="mr-2 mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />
                    <span>Flexibility to grow your presence over time.</span>
                </li>
            </ul>
            <p>
                We&apos;re working toward giving you full ownership of your data, with less reliance on centralized
                systems. For now, your Circles profile lives securely on our platform, but we’re on a path to bring even
                more control to your fingertips.
            </p>
        </div>
        <Button onClick={onNext} className="w-full rounded-full bg-blue-600 text-white hover:bg-blue-700">
            Create Profile
        </Button>
    </div>
);

interface DisplayNameStepProps {
    onNext: () => void;
}

const DisplayNameStep: React.FC<DisplayNameStepProps> = ({ onNext }) => {
    const [displayName, setDisplayName] = useState("");
    const [isPending, setIsPending] = useState(false);
    const [user, setUser] = useAtom(userAtom);

    const handleCreateAccount = async () => {
        try {
            setIsPending(true);
            const { user, privateKey } = await createAccountAction(displayName);
            let accountAndPrivateKey: AccountAndPrivateKey = {
                did: user.did!,
                publicKey: user.publicKey!,
                name: user.name ?? "",
                handle: user.handle ?? "",
                picture: user.picture?.url ?? "",
                requireAuthentication: false,
                privateKey: privateKey,
            };

            setUser(user);

            // Send private key to SSI app for storage
            window.ReactNativeWebView?.postMessage(
                JSON.stringify({
                    type: "CreateAccount",
                    account: accountAndPrivateKey,
                }),
            );

            onNext();
        } catch (error) {
            console.error("Error creating account:", error);
            setIsPending(false);
        }
    };

    return (
        <div className="mx-auto max-w-md space-y-6">
            <h2 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">Choose your display name</h2>
            <p className="text-center text-gray-600">This is how you&apos;ll appear to others in Circles</p>
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input
                        id="displayName"
                        placeholder="Enter your display name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="rounded-full"
                    />
                </div>
                <Button
                    onClick={handleCreateAccount}
                    disabled={!displayName || isPending}
                    className="w-full rounded-full bg-blue-600 text-white hover:bg-blue-700"
                >
                    {isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating account...
                        </>
                    ) : (
                        "Create account"
                    )}
                </Button>
            </div>
        </div>
    );
};

interface ProfilePictureStepProps {
    onNext: () => void;
}

const ProfilePictureStep: React.FC<ProfilePictureStepProps> = ({ onNext }) => {
    const [profilePicture, setProfilePicture] = useState<File | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setProfilePicture(e.target.files[0]);
        }
    };

    return (
        <div className="mx-auto max-w-md space-y-6">
            <h2 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">Add a profile picture</h2>
            <p className="text-center text-gray-600">Show the world who you are.</p>
            <div className="space-y-4">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        {profilePicture ? (
                            <img
                                src={URL.createObjectURL(profilePicture)}
                                alt="Profile preview"
                                className="h-32 w-32 rounded-full object-cover"
                            />
                        ) : (
                            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gray-100">
                                <User className="h-12 w-12 text-gray-400" />
                            </div>
                        )}
                    </div>
                    <div className="flex gap-4">
                        <Input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            id="profile-picture"
                            onChange={handleFileChange}
                        />
                        <Label
                            htmlFor="profile-picture"
                            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-full border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                        >
                            Choose Image
                        </Label>
                    </div>
                </div>
                <Button onClick={onNext} className="w-full rounded-full bg-blue-600 text-white hover:bg-blue-700">
                    Continue
                </Button>
            </div>
        </div>
    );
};

const ResponsibilityStep: React.FC = () => {
    const [authInfo, setAuthInfo] = useAtom(authInfoAtom);

    const onComplete = () => {
        setAuthInfo({ ...authInfo, authStatus: "authenticated" });
    };

    return (
        <div className="mx-auto max-w-md space-y-6">
            <h2 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">A Few Important Notes</h2>
            <div className="space-y-4 text-sm text-gray-600 md:text-base">
                <p className="font-medium">With great power comes great responsibility:</p>
                <ul className="list-disc space-y-2 pl-6">
                    <li>Please use Circles ethically and responsibly.</li>
                    <li>You are responsible for managing and protecting your own data.</li>
                    <li>Share data only with consent and consideration for privacy.</li>
                </ul>
            </div>
            <Button
                onClick={onComplete}
                size="lg"
                className="w-full rounded-full bg-blue-600 text-white hover:bg-blue-700"
            >
                Enter Circles
            </Button>
        </div>
    );
};

export const CreateAccountWizard = () => {
    const [step, setStep] = useState(0);

    useEffect(() => {
        if (logLevel >= LOG_LEVEL_TRACE) {
            console.log("useEffect.CreateAccountWizard.1");
        }
    }, []);

    const handleNextStep = () => {
        setStep((prevStep) => prevStep + 1);
    };

    const renderStep = () => {
        switch (step) {
            case 0:
                return <WelcomeStep onNext={handleNextStep} />;
            case 1:
                return <IdentityStep onNext={handleNextStep} />;
            case 2:
                return <DisplayNameStep onNext={handleNextStep} />;
            // case 3:
            //     return <ProfilePictureStep onNext={handleNextStep} />;
            case 3:
                return <ResponsibilityStep />;
            default:
                return null;
        }
    };

    return (
        <div className="absolute z-[500] flex h-screen w-screen flex-col bg-white">
            <div className="h-2 bg-gray-100">
                <div
                    className="h-full bg-blue-600 transition-all duration-300 ease-in-out"
                    style={{ width: `${(step / 4) * 100}%` }}
                />
            </div>
            <div className="flex flex-grow items-center justify-center p-4 pl-6 pr-6">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="w-full"
                    >
                        {renderStep()}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
};
