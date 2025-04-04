import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import {
    Circle,
    FormField as FormFieldType,
    MemberDisplay,
    RegistryInfo,
    UserGroup,
    UserPrivate,
} from "@/models/models";
import { Textarea } from "../ui/textarea";
import Image from "next/image";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { cn } from "@/lib/utils";
import { FaLock } from "react-icons/fa6";
import { FaCheck } from "react-icons/fa";
import { features, causes, skills } from "@/lib/data/constants";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Search, XCircle } from "lucide-react";
import { getMemberAccessLevel, isAuthorized } from "@/lib/auth/client-auth";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { Switch } from "../ui/switch";
import { WithContext as ReactTags } from "react-tag-input";
import { getUserOrCircleInfo } from "@/lib/utils/form";
import LocationPicker from "./location-picker";
import { fetchCausesMatchedToCircle, fetchSkillsMatchedToCircle } from "../onboarding/actions";
import { ScrollArea } from "../ui/scroll-area";
import { ItemGridCard } from "../onboarding/item-card";
import SelectedItemBadge from "../onboarding/selected-item-badge";
import { Card, CardDescription, CardHeader, CardTitle } from "../ui/card";

type RenderFieldProps = {
    field: FormFieldType;
    formField: ControllerRenderProps<any, any>;
    control: Control;
    collapse?: boolean;
    readOnly?: boolean;
    isUser?: boolean;
};

export const DynamicTextField: React.FC<RenderFieldProps> = ({ field, formField, collapse, readOnly, isUser }) => (
    <FormItem style={{ visibility: collapse ? "collapse" : "visible" }}>
        <FormLabel>{getUserOrCircleInfo(field.label, isUser)}</FormLabel>
        <FormControl>
            <Input
                type="text"
                placeholder={field.placeholder}
                autoComplete={field.autoComplete}
                readOnly={readOnly}
                disabled={field.disabled}
                {...formField}
                value={formField.value || ""}
            />
        </FormControl>
        {field.description && <FormDescription>{getUserOrCircleInfo(field.description, isUser)}</FormDescription>}
        <FormMessage />
    </FormItem>
);

export const DynamicTextareaField: React.FC<RenderFieldProps> = ({ field, formField, readOnly, isUser }) => {
    const [charCount, setCharCount] = useState(formField.value?.length || 0);

    useEffect(() => {
        setCharCount(formField.value?.length || 0);
    }, [formField.value]);

    return (
        <FormItem>
            <div className="flex flex-row items-center justify-between">
                <FormLabel>{getUserOrCircleInfo(field.label, isUser)}</FormLabel>
                {field.maxLength && <div className="text-[12px]">{`${charCount}/${field.maxLength}`}</div>}
            </div>
            <FormControl>
                <Textarea
                    placeholder={field.placeholder}
                    autoComplete={field.autoComplete}
                    readOnly={readOnly}
                    {...formField}
                    value={formField.value || ""}
                />
            </FormControl>
            {field.description && <FormDescription>{getUserOrCircleInfo(field.description, isUser)}</FormDescription>}
            <FormMessage />
        </FormItem>
    );
};

export const DynamicSelectField: React.FC<RenderFieldProps> = ({ field, formField, readOnly, isUser }) => (
    <FormItem>
        <FormLabel>{getUserOrCircleInfo(field.label, isUser)}</FormLabel>
        <Select onValueChange={formField.onChange} defaultValue={formField.value}>
            <FormControl>
                <SelectTrigger>
                    <SelectValue placeholder={`Select ${getUserOrCircleInfo(field.label, isUser).toLowerCase()}`} />
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

export const DynamicPasswordField: React.FC<RenderFieldProps> = ({ field, formField, readOnly, isUser }) => {
    const [showPassword, setShowPassword] = useState(false);

    const togglePasswordVisibility = () => {
        setShowPassword(!showPassword);
    };

    return (
        <FormItem>
            <FormLabel>{getUserOrCircleInfo(field.label, isUser)}</FormLabel>
            <FormControl>
                <div className="relative">
                    <Input
                        type={showPassword ? "text" : "password"}
                        placeholder={field.placeholder}
                        autoComplete={field.autoComplete}
                        readOnly={readOnly}
                        {...formField}
                        value={formField.value || ""}
                    />
                    <div className="absolute right-[2px] top-0 flex h-[40px] flex-row items-center justify-center">
                        <Button
                            className="h-[38px] w-[38px] bg-[#ffffffdd]"
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={togglePasswordVisibility}
                        >
                            {showPassword ? <FaEyeSlash size="14px" /> : <FaEye size="14px" />}
                        </Button>
                    </div>
                </div>
            </FormControl>
            {field.description && <FormDescription>{getUserOrCircleInfo(field.description, isUser)}</FormDescription>}
            <FormMessage />
        </FormItem>
    );
};

export const DynamicImageField: React.FC<RenderFieldProps> = ({ field, formField, readOnly, isUser }) => {
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
            <FormLabel>{getUserOrCircleInfo(field.label, isUser)}</FormLabel>
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
                    onClick={triggerFileInput}
                    className="cursor-pointer object-cover"
                    style={{
                        cursor: readOnly ? "default" : "pointer",
                    }}
                />
            )}

            {!readOnly && (
                <Button type="button" variant="outline" onClick={triggerFileInput} className="flex">
                    Upload new image
                </Button>
            )}

            {field.description && <FormDescription>{getUserOrCircleInfo(field.description, isUser)}</FormDescription>}
            <FormMessage />
        </FormItem>
    );
};

export const DynamicAutoHandleField: React.FC<RenderFieldProps> = ({ field, formField, readOnly, isUser }) => {
    const { watch } = useFormContext();
    const nameField = watch("name");
    const [hasUserEdited, setHasUserEdited] = useState(false);
    const previousNameRef = useRef(nameField);

    // Function to generate handle from name
    const generateHandleFromName = (name: string) => {
        if (!name) return "";
        return name
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "");
    };

    useEffect(() => {
        // Only auto-update handle if the user hasn't manually edited it yet
        // and if the name has actually changed (prevents infinite loops)
        if (!hasUserEdited && nameField && nameField !== previousNameRef.current) {
            previousNameRef.current = nameField;
            const generatedHandle = generateHandleFromName(nameField);
            // Only update if handle would actually change
            if (generatedHandle !== formField.value) {
                formField.onChange(generatedHandle);
            }
        }
    }, [nameField, formField, hasUserEdited]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        // Mark as user-edited if the value was changed by the user
        if (newValue !== formField.value) {
            setHasUserEdited(true);
        }
        formField.onChange(newValue);
    };

    // Check on mount if handle already has a value (for form resubmission cases)
    useEffect(() => {
        if (formField.value && nameField) {
            const generatedHandle = generateHandleFromName(nameField);
            // If value differs from what would be generated, assume user edited it
            if (formField.value !== generatedHandle) {
                setHasUserEdited(true);
            }
        }
    }, []);

    return (
        <FormItem>
            <FormLabel>{getUserOrCircleInfo(field.label, isUser)}</FormLabel>
            <FormControl>
                <Input
                    type="text"
                    placeholder={field.placeholder}
                    autoComplete={field.autoComplete}
                    readOnly={readOnly}
                    {...formField}
                    value={formField.value || ""}
                    onChange={handleInputChange}
                />
            </FormControl>
            {field.description && <FormDescription>{getUserOrCircleInfo(field.description, isUser)}</FormDescription>}
            <FormMessage />
        </FormItem>
    );
};

export const DynamicArrayField: React.FC<RenderFieldProps> = ({ field, formField, control, readOnly, isUser }) => {
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
                <h1 className="m-0 p-0 pb-3 text-xl font-bold">{getUserOrCircleInfo(field.label, isUser)}</h1>
                <Button type="button" onClick={() => append({})}>
                    Add {getUserOrCircleInfo(field.itemSchema.title, isUser)}
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

export const DynamicTableField: React.FC<RenderFieldProps> = ({ field, formField, control, readOnly, isUser }) => {
    const { fields, append, remove, swap } = useFieldArray({
        control,
        name: formField.name,
    });
    const watchedFields = useWatch({ control, name: formField.name });
    const columns: ColumnDef<any>[] =
        field.itemSchema?.fields
            .filter((x) => x.showInHeader)
            .map((subField) => ({
                accessorKey: subField.name,
                header: getUserOrCircleInfo(subField.label, isUser),
            })) ?? [];
    const table = useReactTable({ columns: columns, data: watchedFields ?? [], getCoreRowModel: getCoreRowModel() });
    const [editingId, setEditingId] = useState<string | null>(null);
    const {
        formState: { errors },
    } = useFormContext();

    if (field.itemSchema === undefined) {
        return null;
    }

    const onRowClick = (id: string) => {
        setEditingId(editingId === id ? null : id);
    };

    const onAddClick = () => {
        let newValue = field?.defaultValue ? { ...field.defaultValue } : {};
        append(newValue);

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

    const moveRow = (index: number, direction: "up" | "down") => {
        if (direction === "up" && index > 0) {
            swap(index, index - 1);
        } else if (direction === "down" && index < fields.length - 1) {
            swap(index, index + 1);
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between pb-2">
                <h1 className="m-0 p-0 pb-3 text-xl font-bold">{getUserOrCircleInfo(field.label, isUser)}</h1>
                {!readOnly && (
                    <Button type="button" size="sm" onClick={() => onAddClick()}>
                        Add {getUserOrCircleInfo(field.itemSchema.title, isUser)}
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
                                <TableHead key="_moveRow" />
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row, index) => {
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
                                            className="group h-[53px]"
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
                                            <TableCell className="relative m-0 p-0">
                                                {!readOnly && (
                                                    <div className="absolute right-0 top-0 flex transform flex-col items-center opacity-0 group-hover:opacity-100">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="icon"
                                                            className="h-[26px] w-[26px]"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                moveRow(index, "up");
                                                            }}
                                                        >
                                                            <ChevronUp className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="icon"
                                                            className="h-[26px] w-[26px]"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                moveRow(index, "down");
                                                            }}
                                                        >
                                                            <ChevronDown className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                        {editingId === row.id && (
                                            <tr className="border-b bg-muted/50 transition-colors">
                                                <td colSpan={columns.length + 2}>
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
                                <TableCell colSpan={columns.length + 2} className="h-24 text-center">
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
    userGroups: UserGroup[];
    enabledModules: string[];
    control: any;
};

export const DynamicAccessRulesGrid: React.FC<DynamicAccessRulesGridProps> = ({
    userGroups,
    enabledModules,
    control,
}) => {
    const { setValue, getValues } = useFormContext();
    const accessRules = useWatch({ control, name: "accessRules" });

    // Initialize default access rules if they don't exist
    useEffect(() => {
        const currentAccessRules = getValues("accessRules") || {};
        let hasChanges = false;

        // For each module in features
        for (const moduleHandle of Object.keys(features)) {
            // Skip modules that aren't enabled
            if (moduleHandle !== "general" && !enabledModules.includes(moduleHandle)) continue;

            // Initialize module if it doesn't exist
            if (!currentAccessRules[moduleHandle]) {
                currentAccessRules[moduleHandle] = {};
                hasChanges = true;
            }

            // Get module features
            const moduleFeatures = features[moduleHandle as keyof typeof features];

            // For each feature in the module
            for (const featureHandle in moduleFeatures) {
                // Skip if feature already has access rules
                if (currentAccessRules[moduleHandle][featureHandle]) continue;

                // Get feature
                const feature = (moduleFeatures as any)[featureHandle];

                // Initialize with default user groups
                if (feature && feature.defaultUserGroups) {
                    currentAccessRules[moduleHandle][featureHandle] = [...feature.defaultUserGroups];
                    hasChanges = true;
                }
            }
        }

        // If we made changes, update the form
        if (hasChanges) {
            setValue("accessRules", { ...currentAccessRules });
        }
    }, [enabledModules, setValue, getValues]);

    const handleCellClick = (moduleHandle: string, featureHandle: string, userGroup: string) => {
        const currentAccessRules = getValues("accessRules") || {};

        // Initialize module if it doesn't exist
        if (!currentAccessRules[moduleHandle]) {
            currentAccessRules[moduleHandle] = {};
        }

        // Initialize feature if it doesn't exist
        if (!currentAccessRules[moduleHandle][featureHandle]) {
            currentAccessRules[moduleHandle][featureHandle] = [];
        }

        const userGroups = currentAccessRules[moduleHandle][featureHandle] || [];

        // Toggle user group
        const updatedUserGroups = userGroups.includes(userGroup)
            ? userGroups.filter((ug: string) => ug !== userGroup)
            : [...userGroups, userGroup];

        // Update access rules
        setValue(`accessRules.${moduleHandle}.${featureHandle}`, updatedUserGroups);
    };

    // Get feature name from module and feature handle
    const getFeatureName = (moduleHandle: string, featureHandle: string): string => {
        const moduleFeatures = features[moduleHandle as keyof typeof features];
        if (!moduleFeatures) return featureHandle;

        const feature = (moduleFeatures as any)[featureHandle];
        return feature?.name || featureHandle;
    };

    // Get module name from module handle
    const getModuleName = (moduleHandle: string): string => {
        switch (moduleHandle) {
            case "general":
                return "General";
            case "feed":
                return "Feed";
            case "chat":
                return "Chat";
            case "followers":
                return "Followers";
            case "circles":
                return "Circles";
            case "projects":
                return "Projects";
            case "settings":
                return "Settings";
            case "home":
                return "Home";
            default:
                return moduleHandle;
        }
    };

    // Get all enabled modules, always include general
    const modulesToShow = ["general", ...enabledModules.filter((m) => m !== "general")];

    return (
        <div className="space-y-8">
            {modulesToShow.map((moduleHandle) => {
                // Get module features
                const moduleFeatures = features[moduleHandle as keyof typeof features];
                if (!moduleFeatures) return null;

                // Get feature handles
                const featureHandles = Object.keys(moduleFeatures);
                if (featureHandles.length === 0) return null;

                return (
                    <div key={moduleHandle} className="rounded-md border">
                        <div className="border-b bg-muted/50 p-2 font-medium">{getModuleName(moduleHandle)}</div>
                        <table className="w-full table-fixed border-collapse">
                            <thead>
                                <tr>
                                    <th className="w-1/4 border-b p-2 text-left">Feature</th>
                                    {userGroups.map((userGroup) => (
                                        <th key={userGroup.handle} className="border-b p-2 text-center">
                                            {userGroup.name}
                                        </th>
                                    ))}
                                    <th className="border-b p-2 text-center">Everyone</th>
                                </tr>
                            </thead>
                            <tbody>
                                {featureHandles.map((featureHandle) => (
                                    <tr key={featureHandle} className="border-t">
                                        <td className="border-r p-2">{getFeatureName(moduleHandle, featureHandle)}</td>
                                        {userGroups.map((userGroup) => (
                                            <td
                                                key={userGroup.handle}
                                                className={cn("cursor-pointer p-2 text-center text-[#254d19]", {
                                                    "bg-[#baf9c0]": accessRules?.[moduleHandle]?.[
                                                        featureHandle
                                                    ]?.includes(userGroup.handle),
                                                })}
                                                onClick={() =>
                                                    handleCellClick(moduleHandle, featureHandle, userGroup.handle)
                                                }
                                            >
                                                <div className="flex items-center justify-center">
                                                    {accessRules?.[moduleHandle]?.[featureHandle]?.includes(
                                                        userGroup.handle,
                                                    ) ? (
                                                        <FaCheck />
                                                    ) : (
                                                        ""
                                                    )}
                                                </div>
                                            </td>
                                        ))}
                                        <td
                                            className={cn("cursor-pointer p-2 text-center text-[#254d19]", {
                                                "bg-[#baf9c0]":
                                                    accessRules?.[moduleHandle]?.[featureHandle]?.includes("everyone"),
                                            })}
                                            onClick={() => handleCellClick(moduleHandle, featureHandle, "everyone")}
                                        >
                                            <div className="flex items-center justify-center">
                                                {accessRules?.[moduleHandle]?.[featureHandle]?.includes("everyone") ? (
                                                    <FaCheck />
                                                ) : (
                                                    ""
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            })}
        </div>
    );
};

export const DynamicAccessRulesField: React.FC<RenderFieldProps> = ({
    field,
    formField,
    control,
    readOnly,
    isUser,
}) => {
    const userGroups = useWatch({ control, name: "userGroups" }) || [];
    const enabledModules = useWatch({ control, name: "enabledModules" }) || [];

    return (
        <FormItem>
            <div className="flex items-center justify-between pb-2">
                <h1 className="m-0 p-0 pb-3 text-xl font-bold">{getUserOrCircleInfo(field.label, isUser)}</h1>
            </div>

            <DynamicAccessRulesGrid userGroups={userGroups} enabledModules={enabledModules} control={control} />
            <FormMessage />
        </FormItem>
    );
};

type MemberUserGroupsGridProps = {
    currentUser: UserPrivate | undefined;
    members: MemberDisplay[];
    control: any;
    circle: Circle;
};

export const MemberUserGroupsGrid: React.FC<MemberUserGroupsGridProps> = ({
    currentUser,
    members,
    control,
    circle,
}) => {
    const { setValue, getValues } = useFormContext();
    const memberUserGroups = useWatch({ control, name: "memberUserGroups" });

    const currentUserAccessLevel = getMemberAccessLevel(currentUser, circle);
    const canEditUserGroups =
        isAuthorized(currentUser, circle, features.general.edit_lower_user_groups) ||
        isAuthorized(currentUser, circle, features.general.edit_same_level_user_groups);
    const canEditSameLevelUserGroups = isAuthorized(currentUser, circle, features.general.edit_same_level_user_groups);

    useEffect(() => {
        const initialMemberUserGroups = members.reduce((acc: { [key: string]: string[] }, member) => {
            acc[member.userDid] = member.userGroups ?? [];
            return acc;
        }, {});
        setValue("memberUserGroups", initialMemberUserGroups);
    }, [members, setValue]);

    const handleCellClick = (memberDid: string, userGroup: string) => {
        const currentMemberUserGroups = getValues("memberUserGroups");
        const userGroupsForMember = currentMemberUserGroups?.[memberDid] || [];
        const updatedUserGroupsForMember = userGroupsForMember.includes(userGroup)
            ? userGroupsForMember.filter((ug: string) => ug !== userGroup)
            : [...userGroupsForMember, userGroup];
        setValue(`memberUserGroups["${memberDid}"]`, updatedUserGroupsForMember);
    };

    if (!currentUser) {
        return null;
    }

    return (
        <div>
            <table className="w-full table-fixed border-collapse">
                <thead>
                    <tr>
                        <th className="w-1/4"></th>
                        {circle.userGroups?.map((userGroup, index) => (
                            <th key={index} className={cn("relative h-32 overflow-visible font-normal")}>
                                <div className="absolute bottom-[5px] left-1/2 origin-bottom-left -rotate-45 transform whitespace-nowrap">
                                    {userGroup.name}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {members.map((member, rowIndex) => (
                        <tr key={rowIndex} className="border-t">
                            <td className="border-r p-2">{member.name}</td>
                            {circle.userGroups?.map((userGroup, colIndex) => {
                                const canEdit =
                                    canEditUserGroups &&
                                    (canEditSameLevelUserGroups
                                        ? currentUserAccessLevel <= userGroup.accessLevel
                                        : currentUserAccessLevel < userGroup.accessLevel);
                                return (
                                    <td
                                        key={colIndex}
                                        className={cn("cursor-pointer p-2 text-center", {
                                            "bg-[#baf9c0] text-[#254d19]":
                                                canEdit &&
                                                memberUserGroups?.[member.userDid]?.includes(userGroup.handle),
                                            "bg-gray-200 text-gray-500": !canEdit,
                                        })}
                                        onClick={() => canEdit && handleCellClick(member.userDid, userGroup.handle)}
                                    >
                                        <div className="flex items-center justify-center">
                                            {memberUserGroups?.[member.userDid]?.includes(userGroup.handle) ? (
                                                <FaCheck />
                                            ) : (
                                                ""
                                            )}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export const DynamicRegistryInfoField: React.FC<RenderFieldProps> = ({
    field,
    formField,
    collapse,
    readOnly,
    isUser,
}) => {
    const { watch, setValue } = useFormContext();
    const activeRegistryInfo: RegistryInfo = watch("activeRegistryInfo");
    const registryUrl: string = formField.value;

    const isRegistered = activeRegistryInfo?.registeredAt && activeRegistryInfo.registryUrl === registryUrl;

    return (
        <FormItem>
            <FormLabel>{getUserOrCircleInfo(field.label, isUser)}</FormLabel>
            <FormControl>
                <div className="flex flex-col space-y-2">
                    <div className="flex items-center space-x-2">
                        <Input type="text" placeholder="Registry URL" readOnly={readOnly} {...formField} />
                    </div>
                    {field.description && (
                        <FormDescription>{getUserOrCircleInfo(field.description, isUser)}</FormDescription>
                    )}

                    <div className="flex flex-row items-center gap-1">
                        {isRegistered ? (
                            <CheckCircle2 className="h-[18px] w-[18px] text-green-500" />
                        ) : (
                            <XCircle className="h-[18px]  w-[18px] text-red-500" />
                        )}
                        {isRegistered && activeRegistryInfo?.registeredAt && (
                            <div className="text-sm">
                                Registered at: {new Date(activeRegistryInfo.registeredAt).toLocaleString()}
                            </div>
                        )}
                        {!isRegistered && (
                            <div className="text-sm text-red-500">
                                Server is not registered with the Circles Registry.
                            </div>
                        )}
                    </div>
                </div>
            </FormControl>
            <FormMessage />
        </FormItem>
    );
};

export const DynamicSwitchField: React.FC<RenderFieldProps> = ({ field, formField, readOnly, isUser }) => (
    <FormItem>
        <FormControl>
            <div className="flex items-center justify-between space-x-2">
                <Label htmlFor={field.name} className="flex flex-col space-y-2">
                    <span>{getUserOrCircleInfo(field.label, isUser)}</span>
                    {field.description && (
                        <span className="font-normal leading-snug text-muted-foreground">
                            {getUserOrCircleInfo(field.description, isUser)}
                        </span>
                    )}
                </Label>
                <Switch
                    id={field.name}
                    checked={formField.value !== undefined ? formField.value : field.defaultValue}
                    onCheckedChange={formField.onChange}
                    disabled={readOnly}
                    aria-readonly={readOnly}
                />
            </div>
        </FormControl>
        <FormMessage />
    </FormItem>
);

export const DynamicQuestionnaireField: React.FC<RenderFieldProps> = ({
    field,
    formField,
    control,
    readOnly,
    isUser,
}) => {
    const { fields, append, remove, swap } = useFieldArray({
        control,
        name: formField.name,
    });

    const onAddQuestion = () => {
        append({ question: "", answerType: "text" });
    };

    return (
        <FormItem>
            <div className="flex items-center justify-between pb-2">
                <h1 className="m-0 p-0 pb-3 text-xl font-bold">{getUserOrCircleInfo(field.label, isUser)}</h1>
                {!readOnly && (
                    <Button type="button" size="sm" onClick={onAddQuestion}>
                        Add Question
                    </Button>
                )}
            </div>
            <div className="space-y-4">
                {fields.map((item, index) => (
                    <div key={item.id} className="flex items-center space-x-2">
                        <FormField
                            control={control}
                            name={`${formField.name}.${index}.question`}
                            render={({ field }) => <Input {...field} placeholder="Question" readOnly={readOnly} />}
                        />
                        <FormField
                            control={control}
                            name={`${formField.name}.${index}.answerType`}
                            render={({ field }) => (
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Answer Type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="text">Text</SelectItem>
                                        <SelectItem value="yesno">Yes/No</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        />
                        {!readOnly && (
                            <Button type="button" variant="destructive" size="sm" onClick={() => remove(index)}>
                                Remove
                            </Button>
                        )}
                    </div>
                ))}
            </div>
            <FormMessage />
        </FormItem>
    );
};

const delimiters = [188, 13, 9]; // comma=188, enter=13, tab=9

type Tag = {
    id: string;
    className: string;
    [key: string]: string;
};

export const DynamicTagsField: React.FC<RenderFieldProps> = ({ field, formField, readOnly, isUser }) => {
    const [tags, setTags] = useState<Tag[]>((formField.value || []).map((tag: string) => ({ id: tag, text: tag })));

    const handleDelete = (i: number) => {
        const newTags = tags.filter((_, index) => index !== i);
        setTags(newTags);
        formField.onChange(newTags.map((tag) => tag.text));
    };

    const handleAddition = (tag: Tag) => {
        const newTags = [...tags, tag];
        setTags(newTags);
        formField.onChange(newTags.map((tag) => tag.text));
    };

    const handleDrag = (tag: Tag, currPos: number, newPos: number) => {
        const newTags = [...tags];
        newTags.splice(currPos, 1);
        newTags.splice(newPos, 0, tag);
        setTags(newTags);
        formField.onChange(newTags.map((tag) => tag.text));
    };

    return (
        <FormItem>
            <FormLabel>{getUserOrCircleInfo(field.label, isUser)}</FormLabel>
            <FormControl>
                <ReactTags
                    tags={tags}
                    delimiters={delimiters}
                    handleDelete={handleDelete}
                    handleAddition={handleAddition}
                    handleDrag={handleDrag}
                    inputFieldPosition="top"
                    autoFocus={false}
                    readOnly={readOnly}
                    placeholder="Type and press enter to add new tag"
                    inputProps={{
                        autoComplete: "one-time-code",
                    }}
                />
            </FormControl>

            {field.description && <FormDescription>{getUserOrCircleInfo(field.description, isUser)}</FormDescription>}
            <FormMessage />
        </FormItem>
    );
};

export const DynamicLocationField: React.FC<RenderFieldProps> = ({ field, formField, readOnly, isUser }) => {
    return (
        <FormItem>
            <FormLabel>{getUserOrCircleInfo(field.label, isUser)}</FormLabel>
            <FormControl>
                <LocationPicker value={formField.value} onChange={formField.onChange} />
            </FormControl>
            {field.description && <FormDescription>{getUserOrCircleInfo(field.description, isUser)}</FormDescription>}
            <FormMessage />
        </FormItem>
    );
};

interface ItemSelectionFieldProps extends RenderFieldProps {
    itemType: "causes" | "skills";
}

const ItemSelectionField: React.FC<ItemSelectionFieldProps> = ({
    field,
    formField,
    control,
    readOnly,
    isUser,
    itemType,
}) => {
    const [searchText, setSearchText] = useState("");
    const [allItems, setAllItems] = useState<any[]>([]);
    const [isPending, startTransition] = useTransition();
    const circleId = useWatch({ control, name: "_id" });

    const initialItems = itemType === "causes" ? causes : skills;
    const fetchMatchedItems = itemType === "causes" ? fetchCausesMatchedToCircle : fetchSkillsMatchedToCircle;

    const visibleItems = useMemo(() => {
        if (searchText) {
            return allItems.filter(
                (item) =>
                    item.name.toLowerCase().includes(searchText.toLowerCase()) ||
                    item.description.toLowerCase().includes(searchText.toLowerCase()),
            );
        } else {
            return allItems;
        }
    }, [allItems, searchText]);

    useEffect(() => {
        startTransition(async () => {
            const response = await fetchMatchedItems(circleId);
            if (response.success) {
                setAllItems((response as any)[itemType]);
            } else {
                setAllItems(initialItems);
                console.error(response.message);
            }
        });
    }, []);

    const handleItemToggle = (item: any) => {
        const currentHandles = formField.value || [];
        const newSelectedHandles = currentHandles.includes(item.handle)
            ? currentHandles.filter((handle: string) => handle !== item.handle)
            : [...currentHandles, item.handle];
        formField.onChange(newSelectedHandles);
    };

    return (
        <FormItem>
            <FormLabel>{getUserOrCircleInfo(field.label, isUser)}</FormLabel>
            <div className="space-y-4">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 transform text-gray-400" />
                    <Input
                        type="text"
                        placeholder={field.placeholder || `Search ${itemType}...`}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        className="pl-10"
                        autoComplete="one-time-code"
                    />
                </div>
                <ScrollArea className="h-[360px] w-full rounded-md border-0">
                    <div className="grid grid-cols-3 gap-4 p-[4px]">
                        {isPending && (!visibleItems || visibleItems.length <= 0) && (
                            <div className="col-span-3 flex items-center justify-center">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Loading {itemType}...
                            </div>
                        )}

                        {visibleItems.map((item) => (
                            <ItemGridCard
                                key={item.handle}
                                item={item}
                                isSelected={(formField.value || []).includes(item.handle)}
                                onToggle={() => handleItemToggle(item)}
                                isCause={itemType === "causes"}
                            />
                        ))}
                    </div>
                </ScrollArea>
                <div className="flex flex-wrap">
                    {(formField.value || []).map((handle: string) => {
                        const item = allItems.find((i) => i.handle === handle);
                        if (item) {
                            return (
                                <SelectedItemBadge
                                    key={item.handle}
                                    item={item}
                                    onRemove={() => handleItemToggle(item)}
                                />
                            );
                        }
                        return null;
                    })}
                </div>
                {field.description && (
                    <FormDescription>{getUserOrCircleInfo(field.description, isUser)}</FormDescription>
                )}
                <FormMessage />
            </div>
        </FormItem>
    );
};

export const DynamicField: React.FC<RenderFieldProps> = ({ field, formField, control, readOnly, isUser }) => {
    switch (field.type) {
        case "registry-info":
            return DynamicRegistryInfoField({ field, formField, control, readOnly, isUser });
        case "access-rules":
            return DynamicAccessRulesField({ field, formField, control, readOnly, isUser });
        case "table":
            return DynamicTableField({ field, formField, control, readOnly, isUser });
        case "array":
            return DynamicArrayField({ field, formField, control, readOnly, isUser });
        case "hidden":
            return DynamicTextField({ field, formField, control, readOnly, isUser, collapse: true });
        case "auto-handle":
            return DynamicAutoHandleField({ field, formField, control, readOnly, isUser });
        case "handle":
        case "text":
        case "email":
        case "number":
            return DynamicTextField({ field, formField, control, readOnly, isUser });
        case "textarea":
            return DynamicTextareaField({ field, formField, control, readOnly, isUser });
        case "select":
            return DynamicSelectField({ field, formField, control, readOnly, isUser });
        case "password":
            return DynamicPasswordField({ field, formField, control, readOnly, isUser });
        case "image":
            return DynamicImageField({ field, formField, control, readOnly, isUser });
        case "switch":
            return DynamicSwitchField({ field, formField, control, readOnly, isUser });
        case "questionnaire":
            return DynamicQuestionnaireField({ field, formField, control, readOnly, isUser });
        case "tags":
            return DynamicTagsField({ field, formField, control, readOnly, isUser });
        case "location":
            return DynamicLocationField({ field, formField, control, readOnly, isUser });
        case "skills":
        case "causes":
            return (
                <ItemSelectionField
                    field={field}
                    formField={formField}
                    control={control}
                    readOnly={readOnly}
                    isUser={isUser}
                    itemType={field.type}
                />
            );
        default:
            return null;
    }
};
