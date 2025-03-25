"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OnboardingStepProps } from "./onboarding";
import { useState } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { Loader2, Camera, ImageIcon } from "lucide-react";
import { saveProfileAction } from "./actions";
import EditableImage from "../modules/home/editable-image";
import Image from "next/image";

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
        <div className="space-y-6">
            <h1 className="text-center text-2xl font-bold">About You</h1>
            <p className="text-center text-gray-600">
                Tell others about yourself
            </p>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Profile Images */}
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <Camera className="h-4 w-4" /> Profile Picture
                        </Label>
                        <div className="relative mx-auto h-24 w-24 overflow-hidden rounded-full">
                            {user?._id && (
                                <EditableImage
                                    id="picture"
                                    src={user?.picture?.url ?? "/images/default-user-picture.png"}
                                    alt="Profile Picture"
                                    fill
                                    className="rounded-full border-2 border-white bg-white object-cover shadow-lg"
                                    circleId={user._id}
                                    setCircle={setUser}
                                />
                            )}
                        </div>
                        <p className="text-center text-xs text-gray-500">This appears on all of your posts and comments</p>
                    </div>
                    
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <ImageIcon className="h-4 w-4" /> Cover Image
                        </Label>
                        <div className="relative mx-auto h-32 w-full overflow-hidden rounded-lg">
                            {user?._id && (
                                <EditableImage
                                    id="cover"
                                    src={user?.cover?.url ?? "/images/default-cover.jpg"}
                                    alt="Cover Image"
                                    fill
                                    className="object-cover"
                                    circleId={user._id}
                                    setCircle={setUser}
                                />
                            )}
                        </div>
                        <p className="text-center text-xs text-gray-500">This appears at the top of your profile page</p>
                    </div>
                </div>

                {/* Text Info */}
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
                            className="h-36 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Tell us more about yourself, your interests, and what brings you here"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                        />
                        <p className="text-xs text-gray-500">This detailed description appears on your profile page</p>
                    </div>
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