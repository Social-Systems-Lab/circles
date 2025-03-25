"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { Circle, Location } from "@/models/models";
import { generateHandle } from "@/lib/utils/helpers-client";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Plus } from "lucide-react";
import { onFormSubmit } from "@/components/forms/actions";
import LocationPicker from "@/components/forms/location-picker";

interface CreateProjectDialogProps {
    parentCircle: Circle;
}

export function CreateProjectDialog({ parentCircle }: CreateProjectDialogProps) {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [coverImage, setCoverImage] = useState<File | null>(null);
    const [location, setLocation] = useState<Location>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate inputs
        if (!title.trim()) {
            toast({
                title: "Missing Information",
                description: "Please provide a title for your project",
                variant: "destructive",
            });
            return;
        }

        // Validate file type if provided
        if (coverImage) {
            const validImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
            if (!validImageTypes.includes(coverImage.type)) {
                toast({
                    title: "Invalid File",
                    description: "Please upload a valid image file (JPEG, PNG, GIF, WEBP)",
                    variant: "destructive",
                });
                return;
            }

            // Check file size (5MB max)
            const maxSize = 5 * 1024 * 1024; // 5MB
            if (coverImage.size > maxSize) {
                toast({
                    title: "File Too Large",
                    description: "Image size should be less than 5MB",
                    variant: "destructive",
                });
                return;
            }
        }

        setIsSubmitting(true);

        try {
            // Prepare form data
            const formData = new FormData();
            formData.append("name", title);
            formData.append("handle", generateHandle(title));
            formData.append("content", content);
            formData.append("circleType", "project");
            formData.append("isPublic", "true");
            formData.append("parentCircleId", parentCircle._id);

            if (coverImage) {
                formData.append("cover", coverImage);
            }
            
            if (location) {
                formData.append("location", JSON.stringify(location));
            }

            // Call the `onFormSubmit` server action
            const response = await onFormSubmit("create-circle-form", formData);

            if (!response.success) {
                toast({
                    title: "Failed to create project",
                    description: response.message || "Unknown error occurred",
                    variant: "destructive",
                });
                return;
            }

            setOpen(false);
            toast({
                title: "Success",
                description: "Project created successfully",
            });

            // Refresh the page to show the new project
            router.refresh();
        } catch (error) {
            console.error("Error creating project:", error);
            toast({
                title: "Failed to create project",
                description: error instanceof Error ? error.message : "Unknown error occurred",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                    <Plus className="h-4 w-4" />
                    New Project
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create New Project</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="title">Title</Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Project title"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="content">Description</Label>
                        <Textarea
                            id="content"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Detailed project description"
                            rows={5}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="cover">Cover Image</Label>
                        <Input
                            id="cover"
                            type="file"
                            accept="image/*"
                            onChange={(e) => setCoverImage(e.target.files ? e.target.files[0] : null)}
                        />
                    </div>
                    
                    <div className="space-y-2">
                        <Label>Project Location</Label>
                        <LocationPicker value={location} onChange={setLocation} compact={true} />
                    </div>

                    <div className="flex justify-end space-x-2 pt-4">
                        <Button variant="outline" onClick={() => setOpen(false)} type="button">
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Creating..." : "Create Project"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
