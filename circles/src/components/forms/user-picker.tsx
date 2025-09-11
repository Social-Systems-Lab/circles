"use client";

import React, { useState, useEffect } from "react";
import { Circle } from "@/models/models";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { X } from "lucide-react";
import { getCircleMembersAction } from "@/app/circles/[handle]/events/actions";

type Props = {
    onSelectionChange: (selected: Circle[]) => void;
    initialSelection?: Circle[];
    circleHandle: string;
};

export default function UserPicker({ onSelectionChange, initialSelection = [], circleHandle }: Props) {
    const [search, setSearch] = useState("");
    const [results, setResults] = useState<Circle[]>([]);
    const [selected, setSelected] = useState<Circle[]>(initialSelection);
    const [defaultUsers, setDefaultUsers] = useState<Circle[]>([]);

    useEffect(() => {
        const fetchInitialUsers = async () => {
            const { members } = await getCircleMembersAction(circleHandle);
            setDefaultUsers(members);
            setResults(members);
        };
        fetchInitialUsers();
    }, [circleHandle]);

    useEffect(() => {
        const fetchUsers = async () => {
            if (search.length < 2) {
                setResults(defaultUsers);
                return;
            }
            const response = await fetch(`/api/circles/search?q=${search}&type=user`);
            const data = await response.json();
            setResults(data.circles || []);
        };

        const debounce = setTimeout(fetchUsers, 300);
        return () => clearTimeout(debounce);
    }, [search, defaultUsers]);

    const handleSelect = (user: Circle) => {
        if (!selected.find((s) => s.did === user.did)) {
            const newSelection = [...selected, user];
            setSelected(newSelection);
            onSelectionChange(newSelection);
        }
        setSearch("");
        setResults([]);
    };

    const handleRemove = (user: Circle) => {
        const newSelection = selected.filter((s) => s.did !== user.did);
        setSelected(newSelection);
        onSelectionChange(newSelection);
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 rounded-md border p-2">
                {selected.map((user) => (
                    <div key={user.did} className="flex items-center gap-2 rounded-full bg-secondary px-2 py-1 text-sm">
                        <Avatar className="h-6 w-6">
                            <AvatarImage src={user.picture?.url} />
                            <AvatarFallback>{user.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <span>{user.name}</span>
                        <button
                            onClick={() => handleRemove(user)}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
                <Input
                    className="h-auto flex-grow border-none bg-transparent p-0 focus:ring-0"
                    placeholder="Invite users..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>
            {results.length > 0 && (
                <ScrollArea className="mt-2 h-40 rounded-md border">
                    {results.map((user) => (
                        <div
                            key={user.did}
                            className="flex cursor-pointer items-center gap-3 p-2 hover:bg-muted"
                            onClick={() => handleSelect(user)}
                        >
                            <Avatar>
                                <AvatarImage src={user.picture?.url} />
                                <AvatarFallback>{user.name?.[0]}</AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="font-semibold">{user.name}</p>
                                <p className="text-sm text-muted-foreground">@{user.handle}</p>
                            </div>
                        </div>
                    ))}
                </ScrollArea>
            )}
        </div>
    );
}
