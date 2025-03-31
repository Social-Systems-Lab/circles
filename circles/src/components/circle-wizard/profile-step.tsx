"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CircleWizardStepProps } from "./circle-wizard";
import { useState, useTransition, useRef, useEffect } from "react";
import { Loader2, Camera, ImageIcon } from "lucide-react";
import { saveProfileAction } from "./actions";
import { useToast } from "@/components/ui/use-toast";
import Image from "next/image";

// Create a custom image upload component for the circle wizard
function CircleImageUpload({
    id,
    src,
    alt,
    className,
    onImageUpdate,
    circleData,
}: {
    id: string;
    src: string;
    alt: string;
    className?: string;
    onImageUpdate: (newUrl: string) => void;
    circleData: any;
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const { toast } = useToast();
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            // Create temporary URL for immediate feedback
            const tempUrl = URL.createObjectURL(file);
            onImageUpdate(tempUrl);

            // Store the file for later upload
            setFileToUpload(file);

            toast({
                title: "Image selected",
                description: "The image will be uploaded when you save this step",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to preview image",
                variant: "destructive",
            });
            console.error("Image preview error:", error);
        } finally {
            setIsUploading(false);
        }
    };

    // Expose the file to the parent component
    useEffect(() => {
        if (fileToUpload) {
            if (id === "picture") {
                circleData.pictureFile = fileToUpload;
            } else if (id === "cover") {
                circleData.coverFile = fileToUpload;
            }
        }
    }, [fileToUpload, id, circleData]);

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
            try {
                // For new circles, we don't need to save the profile information yet
                // Just validate and move to the next step
                if (!circleData.description.trim()) {
                    setProfileError("Please provide a short description for your circle");
                    return;
                }

                // Move to the next step
                nextStep();
            } catch (error) {
                setProfileError("An error occurred while processing profile information");
                console.error("Profile error:", error);
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
                            <CircleImageUpload
                                id="picture"
                                src={circleData.picture}
                                alt="Circle Picture"
                                className="rounded-full border-2 border-white bg-white object-cover shadow-lg"
                                circleData={circleData}
                                onImageUpdate={(newUrl) => {
                                    setCircleData((prev) => ({
                                        ...prev,
                                        picture: newUrl,
                                    }));
                                }}
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
                            <CircleImageUpload
                                id="cover"
                                src={circleData.cover}
                                alt="Cover Image"
                                className="object-cover"
                                circleData={circleData}
                                onImageUpdate={(newUrl) => {
                                    setCircleData((prev) => ({
                                        ...prev,
                                        cover: newUrl,
                                    }));
                                }}
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
