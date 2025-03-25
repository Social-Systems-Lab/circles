"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OnboardingStepProps } from "./onboarding";
import { useState } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { Loader2 } from "lucide-react";
import { saveProfileAction } from "./actions";

export default function ProfileStep({ userData, nextStep, prevStep }: OnboardingStepProps) {
    const [user, setUser] = useAtom(userAtom);
    const [shortBio, setShortBio] = useState(user?.description || "");
    const [content, setContent] = useState(user?.content || "");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!user?._id) return;
        
        setIsSubmitting(true);
        try {
            // Save profile and mark the step as completed
            const result = await saveProfileAction(shortBio, content, user._id);
            
            if (result.success) {
                // Update local user state with new values
                const updatedSteps = [...(user.completedOnboardingSteps || [])];
                if (!updatedSteps.includes("profile")) {
                    updatedSteps.push("profile");
                }
                
                setUser({
                    ...user,
                    description: shortBio,
                    content: content,
                    completedOnboardingSteps: updatedSteps
                });
                
                // Move to next step
                nextStep();
            } else {
                console.error("Error saving profile:", result.message);
            }
        } catch (error) {
            console.error("Error updating user profile:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-4">
            <h1 className="text-center text-2xl font-bold">About You</h1>
            <p className="text-center text-gray-600">
                Tell others about yourself
            </p>

            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="shortBio">Short Bio</Label>
                    <Input
                        id="shortBio"
                        placeholder="A brief description about yourself"
                        value={shortBio}
                        onChange={(e) => setShortBio(e.target.value)}
                    />
                    <p className="text-xs text-gray-500">This short description appears in cards and previews</p>
                </div>
                
                <div className="space-y-2">
                    <Label htmlFor="content">About Me</Label>
                    <textarea
                        id="content"
                        className="h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Tell us more about yourself, your interests, and what brings you here"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                    />
                    <p className="text-xs text-gray-500">This detailed description appears on your profile page</p>
                </div>
            </div>

            <div className="flex justify-between pt-4">
                <Button onClick={prevStep} variant="outline">
                    Back
                </Button>
                <Button 
                    onClick={handleSubmit} 
                    disabled={isSubmitting} 
                    className="flex items-center gap-1"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        "Continue"
                    )}
                </Button>
            </div>
        </div>
    );
}