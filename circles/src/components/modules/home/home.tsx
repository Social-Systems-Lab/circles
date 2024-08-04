"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { Circle } from "@/models/models";
import JoinButton from "./join-button";
import { FaCamera, FaUsers } from "react-icons/fa6";
import InviteButton from "./invite-button";
import { FaEdit } from "react-icons/fa";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { updateCircleField } from "./actions";

type EditableFieldProps = {
    value: string;
    onSave: (value: string) => void;
    isEditing: boolean;
    setIsEditing: (value: boolean) => void;
};

const EditableField: React.FC<EditableFieldProps> = ({ value, onSave, isEditing, setIsEditing }) => {
    const [editValue, setEditValue] = useState(value);

    const handleBlur = () => {
        setIsEditing(false);
        if (editValue !== value) {
            onSave(editValue);
        }
    };

    if (isEditing) {
        return <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={handleBlur} autoFocus />;
    }

    return (
        <div className="group relative">
            <span>{value}</span>
            <FaEdit
                className="absolute right-[-20px] top-0 hidden cursor-pointer group-hover:block"
                onClick={() => setIsEditing(true)}
            />
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
};

const EditableImage: React.FC<EditableImageProps> = ({ src, alt, onSave, className, width, height, fill }) => {
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onSave(file);
        }
    };

    return (
        <div className="group relative h-full w-full">
            <Image src={src} alt={alt} className={className} width={width} height={height} fill={fill} />
            <label htmlFor="imageUpload" className="absolute bottom-2 right-2 hidden cursor-pointer group-hover:block">
                <FaCamera size={24} />
            </label>
            <input id="imageUpload" type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        </div>
    );
};

type CircleCoverProps = {
    circle: Circle;
};

const CircleCover = ({ circle }: CircleCoverProps) => {
    return (
        <div className={`relative h-[400px] w-full`}>
            <Image
                src={circle?.cover?.url ?? "/images/default-cover.png"}
                alt="Cover"
                objectFit="cover"
                sizes="100vw"
                fill
            />
        </div>
    );
};

type CirclePictureProps = {
    circle: Circle;
    className?: string;
    size?: number;
};

const CirclePicture = ({ circle, className, size = 40 }: CirclePictureProps) => {
    return (
        <div
            style={{
                width: size + "px",
                height: size + "px",
            }}
        >
            <Image
                className={cn("rounded-full border-2 border-white object-cover", className)}
                src={circle?.picture?.url ?? "/images/default-picture.png"}
                alt="Picture"
                objectFit="cover"
                fill
            />
        </div>
    );
};

type HomeProps = {
    circle: Circle;
    isDefaultCircle: boolean;
};

export default function HomeModule({ circle, isDefaultCircle }: HomeProps) {
    const [isEditingName, setIsEditingName] = useState(false);
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const { toast } = useToast();

    const handleSave = async (field: string, value: any) => {
        const result = await updateCircleField(circle._id!, field, value);
        if (result.success) {
            toast({ title: "Success", description: result.message });
        } else {
            toast({ title: "Error", description: result.message, variant: "destructive" });
        }
    };

    return (
        <div className="flex flex-1 flex-col">
            <div className="h-[400px] w-full">
                <EditableImage
                    src={circle?.cover?.url ?? "/images/default-cover.png"}
                    alt="Cover"
                    onSave={(file) => handleSave("cover", file)}
                    className="h-[400px] w-full object-cover"
                    fill={true}
                />
            </div>
            <div className="relative flex justify-center">
                <div className="absolute top-[-60px]">
                    <EditableImage
                        src={circle?.picture?.url ?? "/images/default-picture.png"}
                        alt="Picture"
                        onSave={(file) => handleSave("picture", file)}
                        className="h-[124px] w-[124px] rounded-full border-2 border-white object-cover"
                        width={124}
                        height={124}
                    />
                </div>
                <div className="absolute right-2 top-2 flex flex-row gap-1">
                    <InviteButton circle={circle} isDefaultCircle={isDefaultCircle} />
                    <JoinButton circle={circle} />
                </div>
            </div>

            <div className="mb-8 mt-[44px] flex flex-col items-center justify-center">
                <EditableField
                    value={circle.name}
                    onSave={(value) => handleSave("name", value)}
                    isEditing={isEditingName}
                    setIsEditing={setIsEditingName}
                />
                <EditableField
                    value={circle.description}
                    onSave={(value) => handleSave("description", value)}
                    isEditing={isEditingDescription}
                    setIsEditing={setIsEditingDescription}
                />
                <div className="flex flex-row items-center justify-center pt-4">
                    <FaUsers />
                    <p className="m-0 ml-2 mr-4">
                        {circle?.members} {circle?.members !== 1 ? "Members" : "Member"}
                    </p>
                </div>
            </div>
        </div>
    );
}
