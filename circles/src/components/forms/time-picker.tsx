"use client";

import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
    value: string;
    onChange: (value: string) => void;
};

const timeOptions = Array.from({ length: 24 * 4 }, (_, i) => {
    const hours = Math.floor(i / 4);
    const minutes = (i % 4) * 15;
    const formattedHours = hours.toString().padStart(2, "0");
    const formattedMinutes = minutes.toString().padStart(2, "0");
    return `${formattedHours}:${formattedMinutes}`;
});

export default function TimePicker({ value, onChange }: Props) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger>
                <SelectValue placeholder="Select time" />
            </SelectTrigger>
            <SelectContent>
                {timeOptions.map((time) => (
                    <SelectItem key={time} value={time}>
                        {time}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
