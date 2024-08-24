// EditableField.tsx
"use client";

import React, { useState, KeyboardEvent } from "react";
import { FaEdit } from "react-icons/fa";
import { Input } from "@/components/ui/input";
import { updateCircleField } from "./actions";
import { useToast } from "@/components/ui/use-toast";

type EditableFieldProps = {
    id: string;
    value: string;
    circleId: string;
    multiline?: boolean;
};

const EditableField: React.FC<EditableFieldProps> = ({ id, value, circleId, multiline = false }) => {
    const [editValue, setEditValue] = useState(value);
    const [isEditing, setIsEditing] = useState(false);
    const { toast } = useToast();

    const handleSave = async () => {
        setIsEditing(false);
        if (editValue !== value) {
            const formData = new FormData();
            formData.append(id, editValue);
            const result = await updateCircleField(circleId, formData);
            if (result.success) {
                toast({ title: "Success", description: result.message });
            } else {
                toast({ title: "Error", description: result.message, variant: "destructive" });
                setEditValue(value);
            }
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

export default EditableField;
