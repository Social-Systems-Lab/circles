"use client";

import React from "react";

interface ChatSearchProps {
    value: string;
    onChange: (value: string) => void;
}

export function ChatSearch({ value, onChange }: ChatSearchProps) {
    return (
        <div className="relative mb-2 px-2">
            <input
                type="text"
                className="w-full rounded border px-2 py-1"
                placeholder="Search chats..."
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
}
