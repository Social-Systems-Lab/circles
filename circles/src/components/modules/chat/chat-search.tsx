"use client";

import React, { useState, useMemo } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { Circle } from "@/models/models";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
import { useRouter } from "next/navigation";
import { findOrCreateDMConversationAction, getAllUsersAction } from "../chat/actions";
import { Loader2 } from "lucide-react";

export function ChatSearch() {
    const [user] = useAtom(userAtom);
    const router = useRouter();


    // Local states
    const [searchTerm, setSearchTerm] = useState("");
    const [allUsers, setAllUsers] = useState<Circle[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [isLoadingAllUsers, setIsLoadingAllUsers] = useState(false);

    // Only fetch all users once, e.g. when user focuses the input
    const fetchAllUsers = async () => {
        if (allUsers.length === 0 && !isLoadingAllUsers) {
            try {
                setIsLoadingAllUsers(true);
                const users = await getAllUsersAction();
                setAllUsers(users || []);
            } catch (err) {
                console.error("Error fetching users:", err);
            } finally {
                setIsLoadingAllUsers(false);
            }
        }
    };

    // Filter for search
    const filteredUsers = useMemo(() => {
        if (!searchTerm.trim()) return [];
        const term = searchTerm.toLowerCase();

        return allUsers.filter((u) => {
            const nameMatch = u.name?.toLowerCase().includes(term);
            const handleMatch = u.handle?.toLowerCase().includes(term);
            return nameMatch || handleMatch;
        });
    }, [allUsers, searchTerm]);

    // Called when user clicks a result
    const handleUserClick = async (clickedUser: Circle) => {
        try {
            const result = await findOrCreateDMConversationAction(clickedUser);
            const conversationId = (result as any)?.chatRoom?._id || (result as any)?.roomId || null;
            if (result?.success && conversationId) {
                router.push("/chat/" + conversationId);
                return;
            }
            console.error("Mongo DM create/find failed:", result);
        } catch (error) {
            console.error("Error handling user click in ChatSearch:", error);
        } finally {
            // Optionally hide the search results after a click
            setShowResults(false);
            setSearchTerm("");
        }
    };

    return (
        <div className="relative mb-2 px-2">
            <input
                type="text"
                className="w-full rounded border px-2 py-1"
                placeholder="Search users..."
                value={searchTerm}
                onFocus={() => {
                    setShowResults(true);
                    // Start fetching all users if not fetched yet
                    fetchAllUsers();
                }}
                onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowResults(true);
                }}
            />

            {/* Example simple dropdown */}
            {showResults && filteredUsers.length > 0 && (
                <div className="relative w-full">
                    <ul className="absolute z-[100] mt-1 max-h-60 w-full overflow-y-auto rounded border bg-white p-1 shadow">
                        {/* Loading indicator if needed */}
                        {isLoadingAllUsers && (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            </>
                        )}
                        {filteredUsers.map((circle) => {
                            if (circle._id === user?._id) {
                                // skip yourself
                                return null;
                            }

                            return (
                                <li
                                    key={circle._id}
                                    className="flex cursor-pointer items-center gap-2 p-2 hover:bg-gray-100"
                                    onClick={() => handleUserClick(circle)}
                                >
                                    <CirclePicture circle={circle} size="30px" />
                                    <div>
                                        <p className="text-sm font-medium">{circle.name}</p>
                                        <p className="text-xs text-gray-500">@{circle.handle}</p>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
