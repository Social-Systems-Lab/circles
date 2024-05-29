import React from "react";
import { FormControl, FormDescription, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Control, ControllerRenderProps } from "react-hook-form";
import { FormField } from "@/models/models";

type RenderFieldProps = {
    field: FormField;
    formField: ControllerRenderProps<any, any>;
};

export const DynamicTextField: React.FC<RenderFieldProps> = ({ field, formField }) => (
    <FormItem>
        <FormLabel>{field.label}</FormLabel>
        <FormControl>
            <Input type="text" placeholder={field.placeholder} autoComplete={field.autoComplete} {...formField} />
        </FormControl>
        {field.description && <FormDescription>{field.description}</FormDescription>}
        <FormMessage />
    </FormItem>
);

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

export const DynamicField: React.FC<RenderFieldProps> = ({ field, formField }) => {
    switch (field.type) {
        case "handle":
        case "text":
        case "email":
            return DynamicTextField({ field, formField });
        case "select":
            return DynamicSelectField({ field, formField });
        case "password":
            return DynamicPasswordField({ field, formField });
        default:
            return null;
    }
};
