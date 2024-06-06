import React, { useEffect, useRef, useState } from "react";
import { FormControl, FormDescription, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Control, Controller, ControllerRenderProps, useFieldArray } from "react-hook-form";
import { FormField } from "@/models/models";
import { Textarea } from "../ui/textarea";
import Image from "next/image";
import { Label } from "../ui/label";
import { Button } from "../ui/button";

type RenderFieldProps = {
    field: FormField;
    formField: ControllerRenderProps<any, any>;
    control: Control;
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
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const triggerFileInput = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    return (
        <FormItem>
            <FormLabel>{field.label}</FormLabel>
            <FormControl>
                <Input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleFileChange(event)}
                    style={{ display: "none" }}
                    id="imageUpload"
                />
            </FormControl>
            {previewUrl && (
                <Image
                    src={previewUrl}
                    alt="Preview"
                    width={field.imagePreviewWidth ?? 120}
                    height={field.imagePreviewHeight ?? 120}
                    objectFit="cover"
                    onClick={triggerFileInput}
                    className="cursor-pointer"
                />
            )}

            <Button type="button" variant="outline" onClick={triggerFileInput}>
                Upload new image
            </Button>

            {field.description && <FormDescription>{field.description}</FormDescription>}
            <FormMessage />
        </FormItem>
    );
};

type DynamicArrayFieldProps = {
    field: FormField;
    formField: ControllerRenderProps<any, any>;
    control: Control;
};

export const DynamicArrayField: React.FC<DynamicArrayFieldProps> = ({ field, formField, control }) => {
    const { fields, append, remove } = useFieldArray({
        control,
        name: formField.name,
    });

    if (field.itemSchema === undefined) {
        return null;
    }

    return (
        <div>
            <div className="flex items-center justify-between">
                <h1 className="m-0 p-0 pb-3 text-xl font-bold">{field.label}</h1>
                <Button type="button" onClick={() => append({})}>
                    Add {field.itemSchema.title}
                </Button>
            </div>
            <div className="space-y-8 pt-4">
                {fields.map((item, index) => (
                    <div key={item.id} className="space-y-8 rounded-md border p-4">
                        {field.itemSchema?.fields.map((subField) => (
                            <Controller
                                key={subField.name}
                                name={`${formField.name}[${index}].${subField.name}`}
                                control={control}
                                render={({ field: subFormField }) => (
                                    <DynamicField field={subField} formField={subFormField} control={control} />
                                )}
                            />
                        ))}
                        <Button type="button" variant="destructive" onClick={() => remove(index)}>
                            Remove
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const DynamicField: React.FC<RenderFieldProps> = ({ field, formField, control }) => {
    switch (field.type) {
        case "array":
            return DynamicArrayField({ field, formField, control });
        case "hidden":
            return DynamicTextField({ field, formField, control, collapse: true });
        case "handle":
        case "text":
        case "email":
            return DynamicTextField({ field, formField, control });
        case "textarea":
            return DynamicTextareaField({ field, formField, control });
        case "select":
            return DynamicSelectField({ field, formField, control });
        case "password":
            return DynamicPasswordField({ field, formField, control });
        case "image":
            return DynamicImageField({ field, formField, control });
        default:
            return null;
    }
};
