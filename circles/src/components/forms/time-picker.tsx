"use client";

import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
    value?: string;
    onChange: (value: string) => void;
};

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const baseTimeOptions = Array.from({ length: 24 * 4 }, (_, i) => {
    const hours = Math.floor(i / 4);
    const minutes = (i % 4) * 15;
    const formattedHours = hours.toString().padStart(2, "0");
    const formattedMinutes = minutes.toString().padStart(2, "0");
    return `${formattedHours}:${formattedMinutes}`;
});

export default function TimePicker({ value, onChange }: Props) {
    const isValid = typeof value === "string" && TIME_REGEX.test(value);
    const options = React.useMemo(() => {
        if (isValid && !baseTimeOptions.includes(value as string)) {
            return [value as string, ...baseTimeOptions];
        }
        return baseTimeOptions;
    }, [isValid, value]);
    return (
        <Select value={isValid ? (value as string) : undefined} onValueChange={onChange}>
            <SelectTrigger>
                <SelectValue placeholder="Select time" />
            </SelectTrigger>
            <SelectContent>
                {options.map((time) => (
                    <SelectItem key={time} value={time}>
                        {time}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
