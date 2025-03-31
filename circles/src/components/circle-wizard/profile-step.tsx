"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CircleWizardStepProps } from "./circle-wizard";
import { useState, useTransition, useRef } from "react";
import { Loader2, Camera, ImageIcon } from "lucide-react";
import { saveProfileAction } from "./actions";

export default function ProfileStep({ circleData, setCircleData, nextStep, prevStep }: CircleWizardStepProps) {
    const [isPending, startTransition] = useTransition();
    const [profileError, setProfileError] = useState("");
    const profilePictureRef = useRef<HTMLInputElement>(null);
    const coverImageRef = useRef<HTMLInputElement>(null);

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        const { name, value } = e.target;

        // Clear any previous errors
        setProfileError("");

        // Update the circle data
        setCircleData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, files } = e.target;

        if (files && files.length > 0) {
            const file = files[0];
            const reader = new FileReader();

            reader.onload = (event) => {
                if (event.target?.result) {
                    setCircleData((prev) => ({
                        ...prev,
                        [name]: event.target?.result as string,
                    }));
                }
            };

            reader.readAsDataURL(file);
        }
    };

    const handleNext = () => {
        startTransition(async () => {
            // Save the profile information
            const result = await saveProfileAction(circleData.description, circleData.content);

            if (result.success) {
                nextStep();
            } else {
                // Handle error
                setProfileError(result.message || "Failed to save profile information");
                console.error(result.message);
            }
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">Circle Profile</h2>
                <p className="text-gray-500">
                    Add details about your circle to help others understand what it's about.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Profile Images */}
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <Camera className="h-4 w-4" /> Circle Picture
                        </Label>
                        <div className="relative mx-auto h-24 w-24 overflow-hidden rounded-full">
                            <img
                                src={circleData.picture}
                                alt="Circle Picture"
                                className="h-full w-full rounded-full border-2 border-white bg-white object-cover shadow-lg"
                            />
                            <label
                                htmlFor="picture"
                                className="absolute bottom-0 left-0 right-0 cursor-pointer bg-black/50 p-1 text-center text-xs text-white"
                            >
                                Change
                            </label>
                            <input
                                ref={profilePictureRef}
                                id="picture"
                                name="picture"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </div>
                        <p className="text-center text-xs text-gray-500">
                            This appears on all of your circle's posts and comments
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <ImageIcon className="h-4 w-4" /> Cover Image
                        </Label>
                        <div className="relative mx-auto h-32 w-full overflow-hidden rounded-lg">
                            <img src={circleData.cover} alt="Cover Image" className="h-full w-full object-cover" />
                            <label
                                htmlFor="cover"
                                className="absolute bottom-0 left-0 right-0 cursor-pointer bg-black/50 p-1 text-center text-xs text-white"
                            >
                                Change
                            </label>
                            <input
                                ref={coverImageRef}
                                id="cover"
                                name="cover"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </div>
                        <p className="text-center text-xs text-gray-500">
                            This appears at the top of your circle's page
                        </p>
                    </div>
                </div>

                {/* Text Info */}
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="description">Short Description</Label>
                        <Input
                            id="description"
                            name="description"
                            value={circleData.description}
                            onChange={handleTextChange}
                            placeholder="A brief description about this circle"
                        />
                        <p className="text-xs text-gray-500">This short description appears in cards and previews</p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="content">Detailed Description</Label>
                        <Textarea
                            id="content"
                            name="content"
                            value={circleData.content}
                            onChange={handleTextChange}
                            placeholder="Tell more about this circle, its goals, and what members can expect"
                            className="h-36"
                        />
                        <p className="text-xs text-gray-500">This detailed description appears on your circle's page</p>
                    </div>
                </div>
            </div>

            {profileError && <p className="text-sm text-red-500">{profileError}</p>}

            <div className="flex justify-between">
                <Button onClick={prevStep} variant="outline" className="rounded-full" disabled={isPending}>
                    Back
                </Button>
                <Button onClick={handleNext} className="w-[100px] rounded-full" disabled={isPending}>
                    {isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        "Next"
                    )}
                </Button>
            </div>
        </div>
    );
}
