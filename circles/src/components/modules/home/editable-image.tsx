// EditableImage.tsx
"use client";

import React, { useState } from "react";
import Image from "next/image";
import { FaCamera } from "react-icons/fa";
import { updateCircleField } from "./actions";
import { useToast } from "@/components/ui/use-toast";

type EditableImageProps = {
    id: string;
    src: string;
    alt: string;
    className?: string;
    width?: number;
    height?: number;
    fill?: boolean;
    circleId: string;
};

const EditableImage: React.FC<EditableImageProps> = ({ id, src, alt, className, width, height, fill, circleId }) => {
    const [currentSrc, setCurrentSrc] = useState(src);
    const { toast } = useToast();

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const formData = new FormData();
            formData.append(id, file);

            const result = await updateCircleField(circleId, formData);
            if (result.success) {
                toast({ title: "Success", description: result.message });

                // Update the image immediately
                const reader = new FileReader();
                reader.onloadend = () => {
                    setCurrentSrc(reader.result as string);
                };
                reader.readAsDataURL(file);
            } else {
                toast({ title: "Error", description: result.message, variant: "destructive" });
            }
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

export default EditableImage;
