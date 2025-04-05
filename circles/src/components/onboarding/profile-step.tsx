"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OnboardingStepProps } from "./onboarding";
import { useEffect, useState, useRef } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { Loader2, Camera, ImageIcon } from "lucide-react";
import { saveProfileAction } from "./actions";
import { updateCircleField } from "../modules/home/actions"; // Keep for profile picture for now
import { useToast } from "@/components/ui/use-toast";
import Image from "next/image";
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader"; // Import MultiImageUploader

// Create a custom image upload component specifically for onboarding
function OnboardingImageUpload({
    id,
    src,
    alt,
    circleId,
    className,
    onImageUpdate,
}: {
    id: string;
    src: string;
    alt: string;
    circleId: string;
    className?: string;
    onImageUpdate: (newUrl: string) => void;
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const { toast } = useToast();

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            // Create temporary URL for immediate feedback
            const tempUrl = URL.createObjectURL(file);
            onImageUpdate(tempUrl);

            // Upload to server
            const formData = new FormData();
            formData.append(id, file);
            const result = await updateCircleField(circleId, formData);

            if (result.success) {
                // Get the permanent URL from the server response
                const permanentUrl = (result.circle as Record<string, { url: string }>)?.[id]?.url;
                if (permanentUrl) {
                    onImageUpdate(permanentUrl);
                    toast({ title: "Success", description: "Image updated successfully" });
                }
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to update image",
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to upload image",
                variant: "destructive",
            });
            console.error("Image upload error:", error);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="group relative h-full w-full">
            {isUploading && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30">
                    <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
            )}
            <Image src={src} alt={alt} fill className={className} />
            <label
                htmlFor={`imageUpload-${id}`}
                className="absolute bottom-2 right-2 hidden cursor-pointer text-white group-hover:block"
            >
                <div className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[#252525]">
                    <Camera className="h-4 w-4" />
                </div>
            </label>
            <input
                id={`imageUpload-${id}`}
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
            />
        </div>
    );
}

export default function ProfileStep({ userData, setUserData, nextStep, prevStep }: OnboardingStepProps) {
    const [user, setUser] = useAtom(userAtom);
    const [shortBio, setShortBio] = useState(user?.description || "");
    const [content, setContent] = useState(user?.content || "");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [profilePicture, setProfilePicture] = useState(user?.picture?.url || "/images/default-user-picture.png");
    // const [coverImage, setCoverImage] = useState(user?.cover?.url || "/images/default-cover.jpg"); // Remove coverImage state
    const [imagesState, setImagesState] = useState<ImageItem[]>(
        user?.images?.map((media) => ({
            id: media.fileInfo.url,
            preview: media.fileInfo.url,
            existingMediaUrl: media.fileInfo.url,
        })) || [],
    );

    // Initialize local state values only once when component mounts
    useEffect(() => {
        if (user) {
            setShortBio(user.description || "");
            setContent(user.content || "");
            setProfilePicture(user.picture?.url || "/images/default-user-picture.png");
            // setCoverImage(user.cover?.url || "/images/default-cover.jpg"); // Remove cover init
            setImagesState(
                user.images?.map((media) => ({
                    id: media.fileInfo.url,
                    preview: media.fileInfo.url,
                    existingMediaUrl: media.fileInfo.url,
                })) || [],
            );

            // Initialize userData picture as well, if it exists
            if (setUserData && userData) {
                // Do this in a timeout to avoid React batch updates that might cause loops
                setTimeout(() => {
                    setUserData((prev) => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            picture: user.picture?.url || prev.picture,
                        };
                    });
                }, 0);
            }
        }
    }, []); // Empty dependency array = only run once on mount

    // We'll control userData updates directly in the handlers instead of with useEffect

    const handleSubmit = async () => {
        if (!user?._id) return;

        setIsSubmitting(true);
        try {
            // TODO: Update saveProfileAction to handle the 'imagesState' array correctly
            // For now, pass the imagesState array. The action needs modification.
            const result = await saveProfileAction(shortBio, content, user._id, undefined, imagesState); // Pass imagesState

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
                    completedOnboardingSteps: updatedSteps,
                    picture: user.picture, // Keep existing picture data
                    // cover: user.cover, // Remove cover update
                    images: imagesState.map((item) => ({
                        // Reconstruct basic Media structure for local state update
                        name: item.file?.name || "Existing Image",
                        type: item.file?.type || "image/jpeg",
                        fileInfo: { url: item.preview },
                    })),
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

    // Function to handle profile picture updates
    const handleProfilePictureUpdate = (newUrl: string) => {
        setProfilePicture(newUrl);

        // Update user atom if the update isn't from a temporary URL
        if (!newUrl.startsWith("blob:")) {
            setUser((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    picture: {
                        ...prev.picture,
                        url: newUrl,
                    },
                };
            });

            // Also update userData for profile summary
            if (setUserData && userData) {
                setUserData((prev) => {
                    if (!prev) return userData;
                    return {
                        ...prev,
                        picture: newUrl,
                    };
                });
            }
        }
    };

    // Remove handleCoverImageUpdate function
    // const handleCoverImageUpdate = (newUrl: string) => { ... };

    return (
        <div className="space-y-6">
            <h1 className="text-center text-2xl font-bold">About You</h1>
            <p className="text-center text-gray-600">Tell others about yourself</p>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Profile Images */}
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <Camera className="h-4 w-4" /> Profile Picture
                        </Label>
                        <div className="relative mx-auto h-24 w-24 overflow-hidden rounded-full">
                            {user?._id && (
                                <OnboardingImageUpload
                                    id="picture"
                                    src={profilePicture}
                                    alt="Profile Picture"
                                    className="rounded-full border-2 border-white bg-white object-cover shadow-lg"
                                    circleId={user._id}
                                    onImageUpdate={handleProfilePictureUpdate}
                                />
                            )}
                        </div>
                        <p className="text-center text-xs text-gray-500">
                            This appears on all of your posts and comments
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <ImageIcon className="h-4 w-4" /> Profile Images
                        </Label>
                        {/* Replace OnboardingImageUpload for cover with MultiImageUploader */}
                        <MultiImageUploader
                            initialImages={user?.images || []}
                            onChange={setImagesState} // Update local state
                            previewMode="compact" // Use compact mode for onboarding
                            enableReordering={true}
                            maxImages={5} // Example limit for onboarding
                            className="w-full"
                            dropzoneClassName="h-32" // Adjust dropzone height
                        />
                        <p className="text-center text-xs text-gray-500">
                            Add images for your profile. Drag to reorder.
                        </p>
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
                <Button onClick={handleSubmit} disabled={isSubmitting} className="flex items-center gap-1">
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
