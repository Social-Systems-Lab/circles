"use client";

import { Post } from "@/models/models";
import DiscussionPost from "./discussion-post";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { ListFilter } from "@/components/utils/list-filter";

interface DiscussionListProps {
    discussions: Post[];
}

type SortOption = "activity" | "newest" | "oldest";

export default function DiscussionList({ discussions }: DiscussionListProps) {
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<SortOption>("activity");

    const filtered = useMemo(() => {
        if (!discussions) return [];
        return discussions.filter(
            (d) =>
                d.title?.toLowerCase().includes(search.toLowerCase()) ||
                d.content?.toLowerCase().includes(search.toLowerCase()),
        );
    }, [discussions, search]);

    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => {
            if (sort === "newest") {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
            if (sort === "oldest") {
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            }
            // activity: compare latest comment or createdAt
            const aActivity = Math.max(
                new Date(a.createdAt).getTime(),
                ...(Array.isArray((a as any).comments)
                    ? (a as any).comments.map((c: any) => new Date(c.createdAt).getTime())
                    : [0]),
            );
            const bActivity = Math.max(
                new Date(b.createdAt).getTime(),
                ...(Array.isArray((b as any).comments)
                    ? (b as any).comments.map((c: any) => new Date(c.createdAt).getTime())
                    : [0]),
            );
            return bActivity - aActivity;
        });
    }, [filtered, sort]);

    if (!discussions || discussions.length === 0) {
        return <div>No discussions yet.</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <Input
                    placeholder="Search discussions..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-sm"
                />
                <ListFilter onFilterChange={(val: string) => setSort(val as SortOption)} />
            </div>
            {sorted.map((d) => (
                <Link
                    key={d._id?.toString()}
                    href={`/circles/${(d as any).circle}/discussions/${d._id}`}
                    className="block"
                >
                    <DiscussionPost discussion={d as any} />
                </Link>
            ))}
        </div>
    );
}
