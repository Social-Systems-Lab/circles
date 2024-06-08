import React, { useEffect, useRef, useState } from "react";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Control,
    Controller,
    ControllerRenderProps,
    FieldErrorsImpl,
    useFieldArray,
    useFormContext,
    useWatch,
} from "react-hook-form";
import { FormField as FormFieldType, UserGroup } from "@/models/models";
import { Textarea } from "../ui/textarea";
import Image from "next/image";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { cn } from "@/lib/utils";
import { FaLock } from "react-icons/fa6";
import { FaCheck } from "react-icons/fa";
import { accessRulesDescriptions } from "@/lib/data/constants";

type RenderFieldProps = {
    field: FormFieldType;
    formField: ControllerRenderProps<any, any>;
    control: Control;
    collapse?: boolean;
    readOnly?: boolean;
};

export const DynamicTextField: React.FC<RenderFieldProps> = ({ field, formField, collapse, readOnly }) => (
    <FormItem style={{ visibility: collapse ? "collapse" : "visible" }}>
        <FormLabel>{field.label}</FormLabel>
        <FormControl>
            <Input
                type="text"
                placeholder={field.placeholder}
                autoComplete={field.autoComplete}
                readOnly={readOnly}
                {...formField}
            />
        </FormControl>
        {field.description && <FormDescription>{field.description}</FormDescription>}
        <FormMessage />
    </FormItem>
);

export const DynamicTextareaField: React.FC<RenderFieldProps> = ({ field, formField, readOnly }) => {
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
                <Textarea
                    placeholder={field.placeholder}
                    autoComplete={field.autoComplete}
                    readOnly={readOnly}
                    {...formField}
                />
            </FormControl>
            {field.description && <FormDescription>{field.description}</FormDescription>}
            <FormMessage />
        </FormItem>
    );
};

export const DynamicSelectField: React.FC<RenderFieldProps> = ({ field, formField, readOnly }) => (
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

export const DynamicPasswordField: React.FC<RenderFieldProps> = ({ field, formField, readOnly }) => (
    <FormItem>
        <FormLabel>{field.label}</FormLabel>
        <FormControl>
            <Input
                type="password"
                placeholder={field.placeholder}
                autoComplete={field.autoComplete}
                readOnly={readOnly}
                {...formField}
            />
        </FormControl>
        <FormMessage />
    </FormItem>
);

export const DynamicImageField: React.FC<RenderFieldProps> = ({ field, formField, readOnly }) => {
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
        if (readOnly) return;
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
                    style={{
                        cursor: readOnly ? "default" : "pointer",
                    }}
                />
            )}

            {!readOnly && (
                <Button type="button" variant="outline" onClick={triggerFileInput}>
                    Upload new image
                </Button>
            )}

            {field.description && <FormDescription>{field.description}</FormDescription>}
            <FormMessage />
        </FormItem>
    );
};

export const DynamicArrayField: React.FC<RenderFieldProps> = ({ field, formField, control, readOnly }) => {
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
                                    <DynamicField
                                        field={subField}
                                        formField={subFormField}
                                        control={control}
                                        readOnly={readOnly}
                                    />
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

export const DynamicTableField: React.FC<RenderFieldProps> = ({ field, formField, control, readOnly }) => {
    const { fields, append, remove } = useFieldArray({
        control,
        name: formField.name,
    });
    const watchedFields = useWatch({ control, name: formField.name });
    const columns: ColumnDef<any>[] =
        field.itemSchema?.fields
            .filter((x) => x.showInHeader)
            .map((subField) => ({
                accessorKey: subField.name,
                header: subField.label,
            })) ?? [];
    const table = useReactTable({ columns: columns, data: watchedFields, getCoreRowModel: getCoreRowModel() });
    const [editingId, setEditingId] = useState<string | null>(null);
    const {
        formState: { errors },
    } = useFormContext();

    if (field.itemSchema === undefined) {
        return null;
    }

    const onRowClick = (id: string) => {
        console.log("setting editing id", id);
        setEditingId(editingId === id ? null : id);
    };

    const onAddClick = () => {
        append({});

        // set editing id to the last item
        setEditingId(fields?.length.toString());
    };

    const onRemoveClick = (index: string) => {
        remove(Number(index));
        setEditingId(null);
    };

    const hasError = (index: number) => {
        return !!(errors[formField.name] as FieldErrorsImpl<any>)?.[index];
    };

    return (
        <div>
            <div className="flex items-center justify-between pb-2">
                <h1 className="m-0 p-0 pb-3 text-xl font-bold">{field.label}</h1>
                {!readOnly && (
                    <Button type="button" size="sm" onClick={() => onAddClick()}>
                        Add {field.itemSchema.title}
                    </Button>
                )}
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                <TableHead key="_locked" />
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead key={header.id}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(header.column.columnDef.header, header.getContext())}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => {
                                const isRowReadOnly = watchedFields[row.index]?.readOnly;
                                return (
                                    <React.Fragment key={row.id}>
                                        <TableRow
                                            key={row.id}
                                            data-state={row.getIsSelected() && "selected"}
                                            onClick={() => onRowClick(row.id)}
                                            style={{
                                                borderBottomWidth: row.id === editingId ? "0px" : "1px",
                                            }}
                                            className="h-[53px]"
                                        >
                                            <TableCell className="pr-2 text-right">
                                                {isRowReadOnly && <FaLock className="text-gray-500" />}
                                            </TableCell>
                                            {row.getVisibleCells().map((cell) => (
                                                <TableCell
                                                    key={cell.id}
                                                    style={{
                                                        color: hasError(row.index) ? "#ef4444" : "inherit",
                                                    }}
                                                >
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                        {editingId === row.id && (
                                            <tr className="border-b bg-muted/50 transition-colors">
                                                <td colSpan={columns.length + 1}>
                                                    <div className="space-y-8 p-4">
                                                        {field.itemSchema?.fields
                                                            .filter((x) => x.type !== "hidden")
                                                            .map((subField) => (
                                                                <FormField
                                                                    key={subField.name}
                                                                    control={control}
                                                                    name={`${formField.name}[${row.index}].${subField.name}`}
                                                                    render={({ field: formField }) => (
                                                                        <DynamicField
                                                                            field={subField}
                                                                            formField={formField}
                                                                            control={control}
                                                                            readOnly={isRowReadOnly}
                                                                        />
                                                                    )}
                                                                />
                                                            ))}
                                                        <Button
                                                            type="button"
                                                            variant="destructive"
                                                            onClick={() => onRemoveClick(row.id)}
                                                            disabled={isRowReadOnly}
                                                        >
                                                            Remove
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center">
                                    No results.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            {errors[formField.name] && (
                <p className="pt-2 text-sm font-medium text-destructive">
                    There are errors in the table rows. Please review them.
                </p>
            )}
        </div>
    );
};

type DynamicAccessRulesGridProps = {
    features: string[];
    userGroups: UserGroup[];
    control: any;
};

export const DynamicAccessRulesGrid: React.FC<DynamicAccessRulesGridProps> = ({ features, userGroups, control }) => {
    const { setValue, getValues } = useFormContext();
    const accessRules = useWatch({ control, name: "accessRules" });

    const handleCellClick = (feature: string, userGroup: string) => {
        const currentAccessRules = getValues("accessRules");
        const userGroupsForFeature = currentAccessRules?.[feature] || [];
        const updatedUserGroupsForFeature = userGroupsForFeature.includes(userGroup)
            ? userGroupsForFeature.filter((ug: string) => ug !== userGroup)
            : [...userGroupsForFeature, userGroup];
        setValue(`accessRules["${feature}"]`, updatedUserGroupsForFeature);
    };

    return (
        <div>
            <table className="w-full table-fixed border-collapse">
                <thead>
                    <tr>
                        <th className="w-1/4"></th>
                        {userGroups.map((userGroup, index) => (
                            <th key={index} className={cn("relative h-32 overflow-visible font-normal")}>
                                <div className="absolute bottom-[5px] left-1/2 origin-bottom-left -rotate-45 transform whitespace-nowrap">
                                    {userGroup.name}
                                </div>
                            </th>
                        ))}
                        <th className="relative h-32 overflow-visible font-normal">
                            <div className="absolute bottom-[5px] left-1/2 origin-bottom-left -rotate-45 transform whitespace-nowrap">
                                Everyone
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {features.map((feature, rowIndex) => (
                        <tr key={rowIndex} className="border-t">
                            <td className="border-r p-2">
                                {(accessRulesDescriptions as any)[feature]?.name ?? feature}
                            </td>
                            {userGroups.map((userGroup, colIndex) => (
                                <td
                                    key={colIndex}
                                    className={cn("cursor-pointer p-2 text-center text-[#254d19]", {
                                        "bg-[#baf9c0]": accessRules?.[feature]?.includes(userGroup.handle),
                                    })}
                                    onClick={() => handleCellClick(feature, userGroup.handle)}
                                >
                                    <div className="flex items-center justify-center">
                                        {accessRules?.[feature]?.includes(userGroup.handle) ? <FaCheck /> : ""}
                                    </div>
                                </td>
                            ))}
                            <td
                                key="everyone"
                                className={cn("cursor-pointer p-2 text-center text-[#254d19]", {
                                    "bg-[#baf9c0]": accessRules?.[feature]?.includes("everyone"),
                                })}
                                onClick={() => handleCellClick(feature, "everyone")}
                            >
                                <div className="flex items-center justify-center">
                                    {accessRules?.[feature]?.includes("everyone") ? <FaCheck /> : ""}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export const DynamicAccessRulesField: React.FC<RenderFieldProps> = ({ field, formField, control, readOnly }) => {
    const userGroups = useWatch({ control, name: "userGroups" }) || [];
    const features = Object.keys(formField.value || {});

    return (
        <FormItem>
            <div className="flex items-center justify-between pb-2">
                <h1 className="m-0 p-0 pb-3 text-xl font-bold">{field.label}</h1>
            </div>

            <DynamicAccessRulesGrid features={features} userGroups={userGroups} control={control} />
            <FormMessage />
        </FormItem>
    );
};

export const DynamicField: React.FC<RenderFieldProps> = ({ field, formField, control, readOnly }) => {
    switch (field.type) {
        case "access-rules":
            return DynamicAccessRulesField({ field, formField, control, readOnly });
        case "table":
            return DynamicTableField({ field, formField, control, readOnly });
        case "array":
            return DynamicArrayField({ field, formField, control, readOnly });
        case "hidden":
            return DynamicTextField({ field, formField, control, readOnly, collapse: true });
        case "handle":
        case "text":
        case "email":
            return DynamicTextField({ field, formField, control, readOnly });
        case "textarea":
            return DynamicTextareaField({ field, formField, control, readOnly });
        case "select":
            return DynamicSelectField({ field, formField, control, readOnly });
        case "password":
            return DynamicPasswordField({ field, formField, control, readOnly });
        case "image":
            return DynamicImageField({ field, formField, control, readOnly });
        default:
            return null;
    }
};
