// create-account-wizard.tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Upload, User, Shield, Share2, Key, Smartphone, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";

const STEPS = [
    { title: "Welcome" },
    { title: "Your Digital Identity" },
    { title: "Display Name" },
    { title: "Profile Picture" },
    { title: "Responsibility" },
];

export const CreateAccountWizard = () => {
    const [step, setStep] = useState(0);
    const [formData, setFormData] = useState({
        displayName: "",
        profilePicture: null as File | null,
    });

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setFormData((prev) => ({ ...prev, profilePicture: e.target.files![0] }));
        }
    };

    const renderStep = () => {
        switch (step) {
            case 0:
                return (
                    <div className="mx-auto max-w-md space-y-6">
                        <h1 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
                            Welcome to Circles
                        </h1>
                        <p className="text-center text-lg text-gray-600 md:text-xl">
                            Your sovereign digital identity starts here
                        </p>
                        <ul className="space-y-3 text-sm text-gray-600 md:text-base">
                            <li className="flex items-start">
                                <Shield className="mr-2 mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />
                                <span>
                                    <strong>Your Data:</strong> You own your data - no third parties, no middle men, and
                                    no clouds.
                                </span>
                            </li>
                            <li className="flex items-start">
                                <Key className="mr-2 mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />
                                <span>
                                    <strong>Your Rules:</strong> You set your boundaries, rules and content curation. No
                                    hidden algorithms.
                                </span>
                            </li>
                            <li className="flex items-start">
                                <User className="mr-2 mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />
                                <span>
                                    <strong>Your Privacy:</strong> Your private information stays encrypted on your
                                    device, accessible to no one but you.
                                </span>
                            </li>
                            <li className="flex items-start">
                                <Share2 className="mr-2 mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />
                                <span>
                                    <strong>Free Forever:</strong> Enjoy limitless access to Circles with no hidden
                                    costs or fees.
                                </span>
                            </li>
                        </ul>
                        <Button
                            onClick={() => setStep(1)}
                            size="lg"
                            className="w-full rounded-full bg-blue-600 text-white hover:bg-blue-700"
                        >
                            Get Started
                            <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                    </div>
                );
            case 1:
                return (
                    <div className="mx-auto max-w-md space-y-6">
                        <h2 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">
                            Your Digital Identity
                        </h2>
                        <div className="space-y-4 text-sm text-gray-600 md:text-base">
                            <p>In the next steps, you'll create your basic profile. Remember, with Circles:</p>
                            <ul className="space-y-2">
                                <li className="flex items-start">
                                    <Smartphone className="mr-2 mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />
                                    <span>Your data stays on your device, not in the cloud</span>
                                </li>
                                <li className="flex items-start">
                                    <Globe className="mr-2 mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />
                                    <span>Your profile, contacts, and posts go with you across platforms</span>
                                </li>
                                <li className="flex items-start">
                                    <Key className="mr-2 mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />
                                    <span>You control what you share and with whom</span>
                                </li>
                            </ul>
                            <p>Let's start building your sovereign digital presence!</p>
                        </div>
                        <Button
                            onClick={() => setStep(2)}
                            className="w-full rounded-full bg-blue-600 text-white hover:bg-blue-700"
                        >
                            Create Profile
                            <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                    </div>
                );
            case 2:
                return (
                    <div className="mx-auto max-w-md space-y-6">
                        <h2 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">
                            Choose your display name
                        </h2>
                        <p className="text-center text-gray-600">This is how you'll appear to others in Circles</p>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="displayName">Display Name</Label>
                                <Input
                                    id="displayName"
                                    placeholder="Enter your display name"
                                    value={formData.displayName}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, displayName: e.target.value }))}
                                    className="rounded-full"
                                />
                            </div>
                            <Button
                                onClick={() => setStep(3)}
                                disabled={!formData.displayName}
                                className="w-full rounded-full bg-blue-600 text-white hover:bg-blue-700"
                            >
                                Continue
                                <ChevronRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                );
            case 3:
                return (
                    <div className="mx-auto max-w-md space-y-6">
                        <h2 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">
                            Add a profile picture
                        </h2>
                        <p className="text-center text-gray-600">Show the world who you are</p>
                        <div className="space-y-4">
                            <div className="flex flex-col items-center gap-4">
                                <div className="relative">
                                    {formData.profilePicture ? (
                                        <img
                                            src={URL.createObjectURL(formData.profilePicture)}
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
                            <Button
                                onClick={() => setStep(4)}
                                className="w-full rounded-full bg-blue-600 text-white hover:bg-blue-700"
                            >
                                Continue
                                <ChevronRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                );
            case 4:
                return (
                    <div className="mx-auto max-w-md space-y-6">
                        <h2 className="text-center text-2xl font-semibold tracking-tight md:text-3xl">
                            A Few Important Notes
                        </h2>
                        <div className="space-y-4 text-sm text-gray-600 md:text-base">
                            <p className="font-medium">With great power comes great responsibility:</p>
                            <ul className="list-disc space-y-2 pl-6">
                                <li>Please use Circles ethically and responsibly</li>
                                <li>You are responsible for managing and protecting your own data</li>
                                <li>Share data only with consent and consideration for privacy</li>
                            </ul>
                        </div>
                        <Button
                            onClick={() => console.log("Complete")}
                            size="lg"
                            className="w-full rounded-full bg-blue-600 text-white hover:bg-blue-700"
                        >
                            Enter Circles
                        </Button>
                    </div>
                );
        }
    };

    return (
        <div className="absolute z-[500] flex h-screen w-screen flex-col bg-white">
            <div className="h-2 bg-gray-100">
                <div
                    className="h-full bg-blue-600 transition-all duration-300 ease-in-out"
                    style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
                />
            </div>
            <div className="flex flex-grow items-center justify-center p-4">
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
