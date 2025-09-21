"use client";

import { Post } from "@/models/models";
import DiscussionPost from "./discussion-post";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

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
                <div className="flex w-full flex-row items-center gap-2">
                    <div className="flex flex-1 flex-col">
                        <Input
                            placeholder="Search discussions..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <Button asChild>
                        <Link href={`/circles/${(discussions[0] as any)?.circle}/discussions/new`}>
                            <Plus className="mr-2 h-4 w-4" /> Create Discussion
                        </Link>
                    </Button>
                </div>
            </div>
            <div className="flex gap-4 text-sm text-gray-600">
                <button
                    onClick={() => setSort("activity")}
                    className={sort === "activity" ? "font-semibold text-blue-600" : ""}
                >
                    Activity
                </button>
                <button
                    onClick={() => setSort("newest")}
                    className={sort === "newest" ? "font-semibold text-blue-600" : ""}
                >
                    New
                </button>
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
