"use client";

import React, { useState } from "react";
import Image from "next/image";
import { FaCamera } from "react-icons/fa";
import { updateCircleField } from "./actions";
import { useToast } from "@/components/ui/use-toast";
import { Circle } from "@/models/models";

type EditableImageProps = {
    id: string;
    src: string;
    alt: string;
    className?: string;
    width?: number;
    height?: number;
    fill?: boolean;
    circleId: string;
    setCircle?: React.Dispatch<React.SetStateAction<any>>;
};

const EditableImage: React.FC<EditableImageProps> = ({
    id,
    src,
    alt,
    className,
    width,
    height,
    fill,
    circleId,
    setCircle,
}) => {
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

                if (setCircle) {
                    let circle = result.circle;
                    if (circle) {
                        let field = circle[id as keyof Circle];
                        console.log("field", field);
                        setCircle((prevCircle: Circle) => {
                            return {
                                ...prevCircle,
                                [id]: field,
                            };
                        });
                        if (field?.url) {
                            setCurrentSrc(field?.url);
                        }
                    }
                } else {
                    // Update the image immediately
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        let res = reader.result as string;
                        setCurrentSrc(res);
                    };
                    reader.readAsDataURL(file);
                }
            } else {
                toast({ title: "Error", description: result.message, variant: "destructive" });
            }
        }
    };

    return (
        <div className="group relative h-full w-full">
            <Image src={currentSrc} alt={alt} className={className} width={width} height={height} fill={fill} />
            <label
                htmlFor={`imageUpload-${circleId}-${id}`}
                className="absolute bottom-2 right-2 hidden cursor-pointer text-white group-hover:block"
            >
                <div className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[#252525]">
                    <FaCamera className="h-4 w-4" />
                </div>
            </label>
            <input
                id={`imageUpload-${circleId}-${id}`}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
            />
        </div>
    );
};

export default EditableImage;
