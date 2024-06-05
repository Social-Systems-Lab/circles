import React, { useEffect, useState } from "react";
import { FormControl, FormDescription, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Control, ControllerRenderProps } from "react-hook-form";
import { FormField } from "@/models/models";
import { Textarea } from "../ui/textarea";
import Image from "next/image";

type RenderFieldProps = {
    field: FormField;
    formField: ControllerRenderProps<any, any>;
    collapse?: boolean;
};

export const DynamicTextField: React.FC<RenderFieldProps> = ({ field, formField, collapse }) => (
    <FormItem style={{ visibility: collapse ? "collapse" : "visible" }}>
        <FormLabel>{field.label}</FormLabel>
        <FormControl>
            <Input type="text" placeholder={field.placeholder} autoComplete={field.autoComplete} {...formField} />
        </FormControl>
        {field.description && <FormDescription>{field.description}</FormDescription>}
        <FormMessage />
    </FormItem>
);

export const DynamicTextareaField: React.FC<RenderFieldProps> = ({ field, formField }) => {
    const [charCount, setCharCount] = useState(formField.value?.length || 0);

    useEffect(() => {
        setCharCount(formField.value?.length || 0);
    }, [formField.value]);

    return (
        <FormItem>
            <div className="flex flex-row items-center justify-between">
                <FormLabel>{field.label}</FormLabel>
                {field.maxLength && <div className="text-[12px]">{`${charCount}/${field.maxLength}`}</div>}
            </div>
            <FormControl>
                <Textarea placeholder={field.placeholder} autoComplete={field.autoComplete} {...formField} />
            </FormControl>
            {field.description && <FormDescription>{field.description}</FormDescription>}
            <FormMessage />
        </FormItem>
    );
};

export const DynamicSelectField: React.FC<RenderFieldProps> = ({ field, formField }) => (
    <FormItem>
        <FormLabel>{field.label}</FormLabel>
        <Select onValueChange={formField.onChange} defaultValue={formField.value}>
            <FormControl>
                <SelectTrigger>
                    <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                </SelectTrigger>
            </FormControl>
            <SelectContent>
                {field.options!.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
        <FormMessage />
    </FormItem>
);

export const DynamicPasswordField: React.FC<RenderFieldProps> = ({ field, formField }) => (
    <FormItem>
        <FormLabel>{field.label}</FormLabel>
        <FormControl>
            <Input type="password" placeholder={field.placeholder} autoComplete={field.autoComplete} {...formField} />
        </FormControl>
        <FormMessage />
    </FormItem>
);

export const DynamicImageField: React.FC<RenderFieldProps> = ({ field, formField }) => {
    const [previewUrl, setPreviewUrl] = useState<string | null>(formField.value?.url || null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        formField.onChange(e.target.files && e.target.files?.[0]);

        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <FormItem>
            <FormLabel>{field.label}</FormLabel>
            <FormControl>
                <Input type="file" accept="image/*" onChange={(event) => handleFileChange(event)} />
            </FormControl>
            {previewUrl && (
                <Image
                    src={previewUrl}
                    alt="Preview"
                    width={field.imagePreviewWidth ?? 120}
                    height={field.imagePreviewHeight ?? 120}
                />
            )}
            {field.description && <FormDescription>{field.description}</FormDescription>}
            <FormMessage />
        </FormItem>
    );
};

export const DynamicField: React.FC<RenderFieldProps> = ({ field, formField }) => {
    switch (field.type) {
        case "hidden":
            return DynamicTextField({ field, formField, collapse: true });
        case "handle":
        case "text":
        case "email":
            return DynamicTextField({ field, formField });
        case "textarea":
            return DynamicTextareaField({ field, formField });
        case "select":
            return DynamicSelectField({ field, formField });
        case "password":
            return DynamicPasswordField({ field, formField });
        case "image":
            return DynamicImageField({ field, formField });
        default:
            return null;
    }
};
