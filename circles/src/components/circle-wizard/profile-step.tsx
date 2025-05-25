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
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader"; // Import MultiImageUploader

// Create a custom image upload component for the circle wizard (KEEPING FOR PROFILE PICTURE FOR NOW)
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
    const [currentSrc, setCurrentSrc] = useState(src); // Initialize internal state

    // Effect to update internal state when src prop changes
    useEffect(() => {
        setCurrentSrc(src);
    }, [src]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        console.log(`CircleImageUpload (${id}): File selected:`, file.name, file.size, file.type);

        setIsUploading(true);
        try {
            // Create temporary URL for immediate feedback
            const tempUrl = URL.createObjectURL(file);
            onImageUpdate(tempUrl);

            // If we have a circle ID, upload the file immediately
            if (circleData._id) {
                // Upload to server
                const formData = new FormData();
                formData.append(id, file);

                // Use updateCircleField from modules/home/actions.ts
                const { updateCircleField } = await import("@/components/modules/home/actions");
                const result = await updateCircleField(circleData._id, formData);

                if (result.success) {
                    // Get the permanent URL from the server response
                    const permanentUrl = (result.circle as any)?.[id]?.url;
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
            } else {
                // If no circle ID yet, store the file for later upload
                setFileToUpload(file);
                console.log(`CircleImageUpload (${id}): No circle ID yet, storing file for later:`, file.name);

                toast({
                    title: "Image selected",
                    description: "The image will be uploaded when you create the circle",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to upload image",
                variant: "destructive",
            });
            console.error(`CircleImageUpload (${id}): Image upload error:`, error);
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
            {/* Use internal currentSrc state for display */}
            <Image src={currentSrc} alt={alt} fill className={className} />
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
    // const coverImageRef = useRef<HTMLInputElement>(null); // Remove cover ref

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
                // Validate the description
                if (!circleData.description.trim()) {
                    setProfileError("Please provide a short description for your circle");
                    return;
                }

                // If we have a circle ID, update the circle with the profile information, including picture and images
                if (circleData._id) {
                    const result = await saveProfileAction(
                        circleData.description,
                        circleData.content,
                        circleData._id,
                        circleData.picture, // Pass picture data (might be URL or File)
                        circleData.images, // Pass the images array
                    );

                    if (!result.success) {
                        setProfileError(result.message || "Failed to save profile information");
                        return;
                    }

                    // Update the circle data with any changes from the server
                    if (result.data?.circle) {
                        const circle = result.data.circle as any;
                        setCircleData((prev) => ({
                            ...prev,
                            description: circle.description || prev.description,
                            content: circle.content || prev.content,
                            picture: circle.picture?.url || prev.picture, // Update picture URL if changed
                            images: circle.images || prev.images, // Update images array if changed
                        }));
                    }
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
                <h2 className="text-2xl font-bold">{circleData.isProjectsPage ? "Project" : "Community"} Profile</h2>
                <p className="text-gray-500">
                    Add details about your {circleData.isProjectsPage ? "project" : "community"} to help others
                    understand what it&apos;s about.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Profile Images */}
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <Camera className="h-4 w-4" /> {circleData.isProjectsPage ? "Project" : "Community"} Picture
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
                            This appears on all of your {circleData.isProjectsPage ? "project" : "community"}&apos;s
                            posts and comments
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <ImageIcon className="h-4 w-4" /> {circleData.isProjectsPage ? "Project" : "Community"}{" "}
                            Cover Pictures
                        </Label>
                        {/* Replace CircleImageUpload for cover with MultiImageUploader */}
                        <MultiImageUploader
                            // Pass images from circleData (parent state)
                            initialImages={
                                circleData.images
                                    ?.filter((item) => item.existingMediaUrl) // Filter out potential non-Media items if needed
                                    .map((item) => ({
                                        // Reconstruct Media structure for initialImages prop
                                        name: "Existing Image",
                                        type: "image/jpeg",
                                        fileInfo: { url: item.existingMediaUrl! },
                                    })) || []
                            }
                            onChange={(newImageItems: ImageItem[]) => {
                                // Directly update the parent state's images array
                                setCircleData((prev) => ({
                                    ...prev,
                                    images: newImageItems,
                                }));
                            }}
                            previewMode="compact" // Use compact mode for wizard
                            enableReordering={true}
                            maxImages={5} // Example limit
                            className="w-full"
                            dropzoneClassName="h-32" // Adjust dropzone height
                        />
                        <p className="text-center text-xs text-gray-500">
                            Add images to showcase and represent your{" "}
                            {circleData.isProjectsPage ? "project" : "community"}. Drag to reorder.
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
                            placeholder={`A brief description about this ${circleData.isProjectsPage ? "project" : "community"}`}
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
                            placeholder={`Tell more about this ${circleData.isProjectsPage ? "project" : "community"}, its goals, and what members can expect`}
                            className="h-36"
                        />
                        <p className="text-xs text-gray-500">
                            This detailed description appears on your{" "}
                            {circleData.isProjectsPage ? "project" : "community"}
                            &apos;s page
                        </p>
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
