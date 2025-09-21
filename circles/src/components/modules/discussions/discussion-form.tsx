"use client";

import { useState, useCallback, useTransition } from "react";
import { createDiscussionAction } from "@/app/circles/[handle]/discussions/actions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, MapPin, Trash2, Loader2 } from "lucide-react";
import { getFullLocationName } from "@/lib/utils";
import { useDropzone } from "react-dropzone";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
    type CarouselApi,
} from "@/components/ui/carousel";
import LocationPicker from "@/components/forms/location-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface DiscussionFormProps {
    circleHandle: string;
    onCreated?: () => void;
}

export default function DiscussionForm({ circleHandle, onCreated }: DiscussionFormProps) {
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
    const [location, setLocation] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
    const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const newImages = acceptedFiles.map((file) => ({
            file,
            preview: URL.createObjectURL(file),
        }));
        setImages((prev) => [...prev, ...newImages]);
    }, []);

    const { getRootProps, getInputProps } = useDropzone({
        onDrop,
        accept: { "image/*": [] },
    });

    const removeImage = (index: number) => {
        setImages((prev) => {
            const newImages = [...prev];
            const removed = newImages.splice(index, 1)[0];
            if (removed) URL.revokeObjectURL(removed.preview);
            return newImages;
        });
    };

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        startTransition(async () => {
            setLoading(true);
            setError(null);
            try {
                const formData = new FormData();
                formData.append("title", title);
                formData.append("content", content);
                if (location) {
                    formData.append("location", JSON.stringify(location));
                }
                images.forEach((img) => {
                    formData.append("media", img.file);
                });
                const discussion = await createDiscussionAction(circleHandle, formData as any);
                setTitle("");
                setContent("");
                setImages([]);
                setLocation(null);
                if (onCreated) {
                    onCreated();
                } else if (discussion?._id) {
                    window.location.href = `/circles/${circleHandle}/discussions/${discussion._id}`;
                }
            } catch (err: any) {
                console.error("Failed to create discussion", err);
                setError(err.message || "Failed to create discussion");
            } finally {
                setLoading(false);
            }
        });
    }

    return (
        <form onSubmit={handleSubmit} className="formatted space-y-4 rounded-lg border bg-white p-4 shadow">
            <h3 className="font-semibold">Start a Discussion</h3>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="w-full rounded border p-2"
                required
            />
            <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What's on your mind?"
                className="min-h-[200px] w-full rounded border p-3 text-base"
                required
            />
            {images.length > 0 && (
                <div className="relative mt-4">
                    <Carousel setApi={setCarouselApi}>
                        <CarouselContent>
                            {images.map((img, idx) => (
                                <CarouselItem key={idx} className="relative">
                                    <img
                                        src={img.preview}
                                        alt={`Uploaded ${idx + 1}`}
                                        className="h-48 w-full rounded-lg object-cover"
                                    />
                                    <Button
                                        variant="destructive"
                                        size="icon"
                                        className="absolute right-2 top-2 rounded-full"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeImage(idx);
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </CarouselItem>
                            ))}
                        </CarouselContent>
                        <CarouselPrevious />
                        <CarouselNext />
                    </Carousel>
                </div>
            )}
            {location && (
                <div className="mt-4 flex flex-row items-center rounded-lg bg-gray-100 p-2">
                    <MapPin className="mr-2 h-5 w-5 text-primary" />
                    {getFullLocationName(location)}
                </div>
            )}
            <div className="mt-4 flex items-center gap-2">
                <input {...getInputProps()} className="hidden" id="discussion-image-input" />
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => document.getElementById("discussion-image-input")?.click()}
                >
                    <ImageIcon className="mr-1 h-4 w-4" /> Add Images
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsLocationDialogOpen(true)}>
                    <MapPin className="mr-1 h-4 w-4" /> Add Location
                </Button>
            </div>
            <Button
                type="submit"
                disabled={loading || isPending}
                className="mt-4 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
            >
                {loading || isPending ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Posting...
                    </>
                ) : (
                    "Post Discussion"
                )}
            </Button>
            <Dialog open={isLocationDialogOpen} onOpenChange={setIsLocationDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Select Location</DialogTitle>
                    </DialogHeader>
                    <LocationPicker value={location} onChange={setLocation} />
                    <div className="mt-4 flex justify-end">
                        <Button variant="secondary" onClick={() => setIsLocationDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="default" onClick={() => setIsLocationDialogOpen(false)} className="ml-2">
                            Set Location
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </form>
    );
}
