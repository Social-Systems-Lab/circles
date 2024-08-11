// EditableHomeModule.tsx
"use client";

import { useState, KeyboardEvent, useEffect } from "react";
import Image from "next/image";
import { Circle } from "@/models/models";
import JoinButton from "./join-button";
import { FaUsers, FaEdit, FaCamera } from "react-icons/fa";
import InviteButton from "./invite-button";
import { Input } from "@/components/ui/input";
import { updateCircleField } from "./actions";
import { useToast } from "@/components/ui/use-toast";

type EditableFieldProps = {
    value: string;
    onSave: (value: string) => void;
    isEditing: boolean;
    setIsEditing: (value: boolean) => void;
    multiline?: boolean;
};

const EditableField: React.FC<EditableFieldProps> = ({ value, onSave, isEditing, setIsEditing, multiline = false }) => {
    const [editValue, setEditValue] = useState(value);

    const handleSave = () => {
        setIsEditing(false);
        if (editValue !== value) {
            onSave(editValue);
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            handleCancel();
        } else if (!multiline && e.key === "Enter") {
            e.preventDefault();
            handleSave();
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditValue(value);
    };

    return (
        <div className="group relative inline-block">
            {isEditing ? (
                multiline ? (
                    <textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleSave}
                        autoFocus
                        className="w-full rounded border p-2"
                    />
                ) : (
                    <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleSave}
                        onKeyDown={handleKeyDown}
                        autoFocus
                    />
                )
            ) : (
                <>
                    <span>{value}</span>
                    <button
                        className="absolute left-full top-1/2 -translate-y-1/2 transform cursor-pointer pl-2 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => setIsEditing(true)}
                    >
                        <FaEdit className="h-4 w-4" />
                    </button>
                </>
            )}
        </div>
    );
};

type EditableImageProps = {
    src: string;
    alt: string;
    onSave: (file: File) => void;
    className?: string;
    width?: number;
    height?: number;
    fill?: boolean;
    id: string;
};

const EditableImage: React.FC<EditableImageProps> = ({ id, src, alt, onSave, className, width, height, fill }) => {
    const [currentSrc, setCurrentSrc] = useState(src);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            await onSave(file);

            // update the image immediately
            const reader = new FileReader();
            reader.onloadend = () => {
                setCurrentSrc(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="group relative h-full w-full">
            <Image src={currentSrc} alt={alt} className={className} width={width} height={height} fill={fill} />
            <label
                htmlFor={`imageUpload-${id}`}
                className="absolute bottom-2 right-2 hidden cursor-pointer text-white group-hover:block"
            >
                <div className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[#252525]">
                    <FaCamera className="h-4 w-4" />
                </div>
            </label>
            <input
                id={`imageUpload-${id}`}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
            />
        </div>
    );
};

type EditableHomeModuleProps = {
    circle: Circle;
    isDefaultCircle: boolean;
    isUser?: boolean;
};

export default function EditableHomeModule({ circle, isDefaultCircle, isUser }: EditableHomeModuleProps) {
    const [isEditingName, setIsEditingName] = useState(false);
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const { toast } = useToast();

    const handleSave = async (field: string, value: any) => {
        const formData = new FormData();
        formData.append(field, value);

        console.log("Updating field", field, value);

        const result = await updateCircleField(circle._id!, formData, isUser);
        if (result.success) {
            toast({ title: "Success", description: result.message });
        } else {
            toast({ title: "Error", description: result.message, variant: "destructive" });
        }
    };

    return (
        <div className="flex flex-1 flex-col">
            <div className="relative h-[400px] w-full">
                <EditableImage
                    id="picture"
                    src={circle?.cover?.url ?? "/images/default-cover.png"}
                    alt="Cover"
                    onSave={(file) => handleSave("cover", file)}
                    className="object-cover"
                    fill
                />
            </div>
            <div className="relative flex justify-center">
                <div className="absolute top-[-60px]">
                    <div className="h-[124px] w-[124px]">
                        <EditableImage
                            id="cover"
                            src={circle?.picture?.url ?? "/images/default-picture.png"}
                            alt="Picture"
                            onSave={(file) => handleSave("picture", file)}
                            className="rounded-full border-2 border-white object-cover"
                            fill
                        />
                    </div>
                </div>
                <div className="absolute right-2 top-2 flex flex-row gap-1">
                    <InviteButton circle={circle} isDefaultCircle={isDefaultCircle} />
                    <JoinButton circle={circle} />
                </div>
            </div>

            <div className="mb-8 mt-[44px] flex flex-col items-center justify-center">
                <h4>
                    <EditableField
                        value={circle.name ?? ""}
                        onSave={(value) => handleSave("name", value)}
                        isEditing={isEditingName}
                        setIsEditing={setIsEditingName}
                    />
                </h4>
                <div className="pl-4 pr-4">
                    <EditableField
                        value={circle.description ?? ""}
                        onSave={(value) => handleSave("description", value)}
                        isEditing={isEditingDescription}
                        setIsEditing={setIsEditingDescription}
                    />
                </div>
                {circle?.members && circle?.members > 0 && (
                    <div className="flex flex-row items-center justify-center pt-4">
                        <FaUsers />
                        <p className="m-0 ml-2 mr-4">
                            {circle?.members}{" "}
                            {circle?.members !== 1 ? (isUser ? "Friends" : "Members") : isUser ? "Friend" : "Member"}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
