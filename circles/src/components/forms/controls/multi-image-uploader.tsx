import React, { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { GripVertical, UploadCloud, X } from "lucide-react"; // Changed icons
import { Button } from "@/components/ui/button";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy, // Use rectSortingStrategy for grids
    useSortable,
    verticalListSortingStrategy, // Use verticalListSortingStrategy for carousel-like lists
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
    type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { Media } from "@/models/models"; // Assuming Media type exists

// Define the structure for an image item
export type ImageItem = {
    id: string; // Unique identifier for dnd-kit and React keys (can be URL for existing, UUID for new)
    file?: File; // The actual file object for new uploads
    preview: string; // URL for preview (object URL or existing URL)
    existingMediaUrl?: string; // URL if it's an existing media item
};

type MultiImageUploaderProps = {
    initialImages?: Media[]; // Existing images to load
    onChange: (items: ImageItem[]) => void; // Callback when images change
    maxImages?: number;
    previewMode?: "compact" | "large";
    enableReordering?: boolean;
    className?: string;
    dropzoneClassName?: string;
};

export function MultiImageUploader({
    initialImages = [],
    onChange,
    maxImages = 10,
    previewMode = "large",
    enableReordering = true,
    className,
    dropzoneClassName,
}: MultiImageUploaderProps) {
    const [images, setImages] = useState<ImageItem[]>([]);
    const [dragging, setDragging] = useState(false);
    const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    // Initialize state with initialImages
    useEffect(() => {
        const initialItems: ImageItem[] = initialImages.map((media) => ({
            id: media.fileInfo.url, // Use URL as unique ID for existing images
            preview: media.fileInfo.url,
            existingMediaUrl: media.fileInfo.url,
        }));
        setImages(initialItems);
        // No need to call onChange here, it's initial state
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only once on mount

    // Cleanup object URLs on unmount
    useEffect(() => {
        return () => {
            images.forEach((image) => {
                if (image.file) {
                    URL.revokeObjectURL(image.preview);
                }
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only on unmount

    const handleSetImages = (newImages: ImageItem[]) => {
        setImages(newImages);
        onChange(newImages); // Notify parent component of changes
    };

    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            setDragging(false);
            const currentImageCount = images.length;
            const filesToAdd = acceptedFiles.slice(0, maxImages - currentImageCount);

            if (filesToAdd.length === 0) return; // Don't add if max reached

            const newImageItems: ImageItem[] = filesToAdd.map((file) => ({
                id: crypto.randomUUID(), // Generate unique ID for new files
                file,
                preview: URL.createObjectURL(file),
            }));

            const updatedImages = [...images, ...newImageItems];
            handleSetImages(updatedImages);

            // Scroll to the newly added images in carousel mode
            if (previewMode === "large") {
                setTimeout(() => {
                    carouselApi?.scrollTo(images.length);
                }, 0);
            }
        },
        [images, maxImages, handleSetImages, previewMode, carouselApi],
    );

    const removeImage = (idToRemove: string) => {
        handleSetImages(
            images.filter((image) => {
                if (image.id === idToRemove) {
                    // Revoke object URL if it was a newly added file
                    if (image.file) {
                        URL.revokeObjectURL(image.preview);
                    }
                    return false; // Remove the image
                }
                return true; // Keep other images
            }),
        );
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { "image/*": [] },
        maxFiles: maxImages,
        onDragEnter: () => setDragging(true),
        onDragLeave: () => setDragging(false),
        onDropAccepted: () => setDragging(false),
        disabled: images.length >= maxImages,
    });

    // Carousel API effect
    useEffect(() => {
        if (!carouselApi || previewMode !== "large") {
            return; // Return undefined if conditions aren't met
        }
        const updateSelectedSlide = () => {
            setCurrentImageIndex(carouselApi.selectedScrollSnap());
        };
        setCurrentImageIndex(carouselApi.selectedScrollSnap() || 0);
        carouselApi.on("select", updateSelectedSlide);

        // Return the cleanup function directly
        return () => {
            carouselApi.off("select", updateSelectedSlide);
        };
    }, [carouselApi, previewMode]);

    // --- Dnd-Kit Setup ---
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setImages((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id);
                const newIndex = items.findIndex((item) => item.id === over.id);
                const newArray = arrayMove(items, oldIndex, newIndex);
                onChange(newArray); // Notify parent of the reordered array
                return newArray;
            });
        }
    }
    // --- End Dnd-Kit Setup ---

    // TODO: Implement Compact Preview Mode

    const renderPreviews = () => {
        if (images.length === 0) return null;

        // Common Sortable Image Wrapper
        const SortableImage = ({ image, index }: { image: ImageItem; index: number }) => {
            const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
                id: image.id,
            });

            const style = {
                transform: CSS.Transform.toString(transform),
                transition,
                zIndex: isDragging ? 10 : undefined, // Ensure dragging item is on top
                opacity: isDragging ? 0.5 : 1,
            };

            const commonImageProps = {
                src: image.preview,
                alt: `Uploaded image ${index + 1}`,
            };

            const removeButton = (
                <Button
                    variant="destructive"
                    size="icon"
                    className={cn(
                        "absolute z-10 rounded-full",
                        previewMode === "large" ? "right-2 top-2 h-6 w-6" : "right-1 top-1 h-5 w-5 p-0",
                    )}
                    onClick={(e) => {
                        e.stopPropagation(); // Prevent dnd listeners from firing
                        removeImage(image.id);
                    }}
                    aria-label="Remove image"
                >
                    <X className={cn(previewMode === "large" ? "h-4 w-4" : "h-3 w-3")} />
                </Button>
            );

            const dragHandle = enableReordering ? (
                <button
                    {...attributes}
                    {...listeners}
                    aria-label="Drag handle"
                    className={cn(
                        "absolute z-10 cursor-grab touch-none rounded-full bg-gray-900/50 p-1 text-white hover:bg-gray-900/75 active:cursor-grabbing",
                        previewMode === "large" ? "left-2 top-2" : "left-1 top-1",
                    )}
                    onClick={(e) => e.stopPropagation()} // Prevent click propagation
                >
                    <GripVertical className={cn(previewMode === "large" ? "h-4 w-4" : "h-3 w-3")} />
                </button>
            ) : null;

            if (previewMode === "large") {
                return (
                    <div ref={setNodeRef} style={style} className="relative basis-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img {...commonImageProps} className="aspect-video h-auto w-full rounded-lg object-cover" />
                        {removeButton}
                        {dragHandle}
                    </div>
                );
            } else {
                // Compact mode
                return (
                    <div ref={setNodeRef} style={style} className="relative aspect-square">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img {...commonImageProps} className="h-full w-full rounded-md object-cover" />
                        {removeButton}
                        {dragHandle}
                    </div>
                );
            }
        };

        const dndWrapper = (children: React.ReactNode) =>
            enableReordering ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext
                        items={images.map((i) => i.id)}
                        strategy={previewMode === "large" ? verticalListSortingStrategy : rectSortingStrategy}
                    >
                        {children}
                    </SortableContext>
                </DndContext>
            ) : (
                children
            );

        if (previewMode === "large") {
            return dndWrapper(
                <div className="relative mt-4">
                    <Carousel setApi={setCarouselApi} className="w-full">
                        <CarouselContent>
                            {images.map((image, index) => (
                                <CarouselItem key={image.id} className="relative basis-full">
                                    <SortableImage image={image} index={index} />
                                </CarouselItem>
                            ))}
                        </CarouselContent>
                        {images.length > 1 &&
                            !enableReordering && ( // Only show carousel nav if not reordering
                                <>
                                    <CarouselPrevious className="left-2 z-20" />{" "}
                                    {/* Ensure nav is above potential drag handle */}
                                    <CarouselNext className="right-2 z-20" />
                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 transform rounded-full bg-black/50 px-2 py-1 text-xs text-white">
                                        {currentImageIndex + 1} / {images.length}
                                    </div>
                                </>
                            )}
                    </Carousel>
                </div>,
            );
        }

        // Compact mode
        if (previewMode === "compact") {
            return dndWrapper(
                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                    {images.map((image, index) => (
                        <SortableImage key={image.id} image={image} index={index} />
                    ))}
                </div>,
            );
        }

        return null;
    };

    return (
        <div className={cn("space-y-4", className)}>
            <div
                {...getRootProps()}
                className={cn(
                    "relative cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-6 text-center transition hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
                    isDragActive && "border-indigo-500 bg-indigo-50",
                    images.length >= maxImages && "cursor-not-allowed border-gray-200 bg-gray-50 opacity-50",
                    dropzoneClassName,
                )}
            >
                <input {...getInputProps()} id="multi-image-upload-input" />
                <div className="flex flex-col items-center justify-center space-y-2">
                    <UploadCloud className="h-10 w-10 text-gray-400" />
                    <p className="text-sm text-gray-600">
                        <span className="font-semibold text-indigo-600">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-gray-500">Images (up to {maxImages})</p>
                </div>
                {dragging &&
                    !isDragActive && ( // Show overlay only when dragging files over the window but not the dropzone itself
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-gray-200/75">
                            <p className="text-lg font-semibold text-gray-700">Drop images here</p>
                        </div>
                    )}
            </div>

            {renderPreviews()}
        </div>
    );
}
