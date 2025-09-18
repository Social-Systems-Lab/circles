"use client";

import { useState } from "react";
import { createDiscussionAction } from "@/app/circles/[handle]/discussions/actions";
import { Textarea } from "@/components/ui/textarea";
import { MultiImageUploader, ImageItem } from "@/components/forms/controls/multi-image-uploader";
import LocationPicker from "@/components/forms/location-picker";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
import { getFullLocationName } from "@/lib/utils";

interface DiscussionFormProps {
    circleHandle: string;
    onCreated?: () => void;
}

export default function DiscussionForm({ circleHandle, onCreated }: DiscussionFormProps) {
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [images, setImages] = useState<File[]>([]);
    const [location, setLocation] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const discussion = await createDiscussionAction(circleHandle, { title, content, location });
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
    }

    function handleImageChange(items: ImageItem[]) {
        const files = items.map((item) => item.file).filter((f): f is File => !!f);
        setImages(files);
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
                className="w-full rounded border p-2"
                required
            />
            <div>
                <label className="block text-sm font-medium">Attach Images</label>
                <MultiImageUploader
                    initialImages={[]}
                    onChange={handleImageChange}
                    maxImages={5}
                    previewMode="compact"
                />
            </div>
            <div>
                <label className="block text-sm font-medium">Location</label>
                <LocationPicker value={location} onChange={(loc) => setLocation(loc)} />
                {location && (
                    <div className="mt-2 flex items-center text-sm text-gray-600">
                        <MapPin className="mr-1 h-4 w-4 text-primary" />
                        {getFullLocationName(location)}
                    </div>
                )}
            </div>
            <Button
                type="submit"
                disabled={loading}
                className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
            >
                {loading ? "Posting..." : "Post Discussion"}
            </Button>
        </form>
    );
}
