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
    Page,
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
import { cn, removeLast } from "@/lib/utils";
import { FaLock } from "react-icons/fa6";
import { FaCheck } from "react-icons/fa";
import {
    features,
    features as featuresList,
    feedFeatures,
    pageFeaturePrefix,
    feedFeaturePrefix,
    chatFeaturePrefix,
    causes,
    skills,
    chatFeatures,
} from "@/lib/data/constants";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Search, XCircle } from "lucide-react";
import { getMemberAccessLevel, isAuthorized } from "@/lib/auth/client-auth";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { Switch } from "../ui/switch";
import { WithContext as ReactTags } from "react-tag-input";
import { getUserOrCircleInfo } from "@/lib/utils/form";
import LocationPicker from "./location-picker";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { fetchCausesMatchedToCircle, fetchSkillsMatchedToCircle } from "../onboarding/actions";
import { ScrollArea } from "../ui/scroll-area";
import { ItemGridCard } from "../onboarding/item-card";
import SelectedItemBadge from "../onboarding/selected-item-badge";

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
    features: string[];
    userGroups: UserGroup[];
    pages: Page[];
    control: any;
};

export const DynamicAccessRulesGrid: React.FC<DynamicAccessRulesGridProps> = ({
    features,
    pages,
    userGroups,
    control,
}) => {
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

    const getFeatureDescription = (feature: string) => {
        if (feature.startsWith(pageFeaturePrefix)) {
            // get page handle
            const pageHandle = feature.replace(pageFeaturePrefix, "");

            // get name from page
            const page = pages.find((p) => p.handle === pageHandle);
            return "View Page: " + page?.name;
        } else if (feature.startsWith(feedFeaturePrefix)) {
            // get feed handle
            const featureWithoutPrefix = feature.replace(feedFeaturePrefix, "");

            // loop through feed features and see if the feature relates to it
            for (const feedFeature of feedFeatures) {
                if (featureWithoutPrefix.endsWith(`_${feedFeature.handle}`)) {
                    const feedHandle = removeLast(featureWithoutPrefix, `_${feedFeature.handle}`);
                    return `${feedFeature.name} Feed: ${feedHandle}`;
                }
            }
        } else if (feature.startsWith(chatFeaturePrefix)) {
            // get chat handle
            const featureWithoutPrefix = feature.replace(chatFeaturePrefix, "");

            // loop through chat features and see if the feature relates to it
            for (const chatFeature of chatFeatures) {
                if (featureWithoutPrefix.endsWith(`_${chatFeature.handle}`)) {
                    const chatHandle = removeLast(featureWithoutPrefix, `_${chatFeature.handle}`);
                    return `${chatFeature.name} Chat Room: ${chatHandle}`;
                }
            }
        } else {
            if (feature in featuresList) {
                return featuresList[feature as keyof typeof featuresList]?.name ?? feature;
            }
        }
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
                            <td className="border-r p-2">{getFeatureDescription(feature)}</td>
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

export const DynamicAccessRulesField: React.FC<RenderFieldProps> = ({
    field,
    formField,
    control,
    readOnly,
    isUser,
}) => {
    const userGroups = useWatch({ control, name: "userGroups" }) || [];
    const pages = useWatch({ control, name: "pages" }) || [];
    const features = Object.keys(formField.value || {});

    return (
        <FormItem>
            <div className="flex items-center justify-between pb-2">
                <h1 className="m-0 p-0 pb-3 text-xl font-bold">{getUserOrCircleInfo(field.label, isUser)}</h1>
            </div>

            <DynamicAccessRulesGrid features={features} pages={pages} userGroups={userGroups} control={control} />
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
        isAuthorized(currentUser, circle, features.edit_lower_user_groups) ||
        isAuthorized(currentUser, circle, features.edit_same_level_user_groups);
    const canEditSameLevelUserGroups = isAuthorized(currentUser, circle, features.edit_same_level_user_groups);

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
                    checked={formField.value}
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
