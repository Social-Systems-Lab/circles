"use client";

import React, { useState, useEffect } from "react";
import { Circle } from "@/models/models";
import { getCirclesBySearchQueryAction } from "@/app/circles/[handle]/events/actions";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Props = {
    onCircleSelected: (circle: Circle) => void;
    itemTitle: string;
    action: string;
};

export default function CirclePicker({ onCircleSelected, itemTitle, action }: Props) {
    const [search, setSearch] = useState("");
    const [circles, setCircles] = useState<Circle[]>([]);

    useEffect(() => {
        const fetchCircles = async () => {
            const { circles } = await getCirclesBySearchQueryAction(search, 25);
            setCircles(circles);
        };

        const debounce = setTimeout(fetchCircles, 300);
        return () => clearTimeout(debounce);
    }, [search]);

    return (
        <div>
            <p className="mb-4 text-muted-foreground">
                Select a circle to {action} this {itemTitle} in.
            </p>
            <Input placeholder="Search for a circle..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <ScrollArea className="mt-4 h-64">
                <div className="space-y-2">
                    {circles.map((circle) => (
                        <div
                            key={circle._id}
                            className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted"
                            onClick={() => onCircleSelected(circle)}
                        >
                            <Avatar>
                                <AvatarImage src={circle.picture?.url} />
                                <AvatarFallback>{circle.name?.[0]}</AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="font-semibold">{circle.name}</p>
                                <p className="text-sm text-muted-foreground">@{circle.handle}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
