"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { Circle } from "@/models/models";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
import { useRouter } from "next/navigation";
import { findOrCreateDMRoomAction, getAllUsersAction } from "../chat/actions";
import { sendRoomMessage } from "@/lib/data/client-matrix";
import { DmChatModal } from "./dm-chat-modal";
import { Loader2 } from "lucide-react";

export function ChatSearch() {
    const [user, setUser] = useAtom(userAtom);
    const router = useRouter();
    const provider = process.env.NEXT_PUBLIC_CHAT_PROVIDER || "matrix";

    // Local states
    const [searchTerm, setSearchTerm] = useState("");
    const [allUsers, setAllUsers] = useState<Circle[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [isLoadingAllUsers, setIsLoadingAllUsers] = useState(false);
    const [showDM, setShowDM] = useState(false);
    const [recipient, setRecipient] = useState<Circle | undefined>(undefined);

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
            if (provider === "mongo") {
                setRecipient(clickedUser);
                setShowDM(true);
                setShowResults(false);
                setSearchTerm("");
                return;
            }

            // Check if there's an existing DM in user.chatRoomMemberships
            const existingMembership = user?.chatRoomMemberships?.find((m) => {
                return (
                    m.chatRoom.isDirect &&
                    // The DM participants might be a list of string IDs
                    m.chatRoom.dmParticipants?.includes(clickedUser._id as string)
                );
            });

            if (existingMembership) {
                // The DM already exists, so just route to it
                router.push(`/chat/${clickedUser.handle}`);
            } else {
                // Otherwise, create a DM
                setRecipient(clickedUser);
                setShowDM(true);
            }
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

            {showDM && recipient && <DmChatModal recipient={recipient} onClose={() => setShowDM(false)} />}
        </div>
    );
}
