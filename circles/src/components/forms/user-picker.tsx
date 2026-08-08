"use client";

import React, { useState, useEffect } from "react";
import { Circle } from "@/models/models";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { getEventInviteCandidatesAction } from "@/app/circles/[handle]/events/actions";

type InviteCandidate = Circle & {
    inviteSources?: ("circle_member" | "contact")[];
    inviteSourceLabel?: string;
    effectiveOccurrenceRsvpStatus?: "going" | "interested";
};

const effectiveRsvpLabel = (status?: InviteCandidate["effectiveOccurrenceRsvpStatus"]) =>
    status === "going" ? "Attending" : status === "interested" ? "Interested" : null;

type Props = {
    onSelectionChange: (selected: InviteCandidate[]) => void;
    onCandidatesLoaded?: (data: {
        candidates: InviteCandidate[];
        canBulkInviteCircleMembers: boolean;
        circleMemberCount: number;
    }) => void;
    initialSelection?: InviteCandidate[];
    circleHandle: string;
    eventId: string;
    excludeDids?: string[];
    effectiveOccurrenceRsvpStatusByDid?: Readonly<Record<string, "going" | "interested">>;
};

export default function UserPicker({
    onSelectionChange,
    initialSelection = [],
    circleHandle,
    eventId,
    excludeDids = [],
    effectiveOccurrenceRsvpStatusByDid = {},
    onCandidatesLoaded,
}: Props) {
    const [search, setSearch] = useState("");
    const [results, setResults] = useState<InviteCandidate[]>([]);
    const [selected, setSelected] = useState<InviteCandidate[]>(initialSelection);
    const [defaultUsers, setDefaultUsers] = useState<InviteCandidate[]>([]);

    useEffect(() => {
        setSelected(initialSelection);
    }, [initialSelection]);

    useEffect(() => {
        const fetchInitialUsers = async () => {
            const data = await getEventInviteCandidatesAction(circleHandle, eventId);
            const filtered = (data.candidates || []).filter((u) => !excludeDids?.includes(u.did!));
            setDefaultUsers(filtered);
            setResults(filtered);
            onCandidatesLoaded?.({
                candidates: filtered,
                canBulkInviteCircleMembers: data.canBulkInviteCircleMembers,
                circleMemberCount: data.circleMemberCount,
            });
        };
        fetchInitialUsers();
    }, [circleHandle, eventId, excludeDids, onCandidatesLoaded]);

    useEffect(() => {
        const fetchUsers = async () => {
            if (search.length < 2) {
                setResults(defaultUsers);
                return;
            }
            try {
                const { candidates } = await getEventInviteCandidatesAction(circleHandle, eventId, search, 50);
                const filtered = (candidates || []).filter((u) => !excludeDids?.includes(u.did!));
                setResults(filtered);
            } catch (e) {
                console.error("Error searching eligible users:", e);
                setResults([]);
            }
        };

        const debounce = setTimeout(fetchUsers, 300);
        return () => clearTimeout(debounce);
    }, [search, defaultUsers, excludeDids, circleHandle, eventId]);

    const handleSelect = (user: InviteCandidate) => {
        if (!selected.find((s) => s.did === user.did)) {
            const newSelection = [...selected, user];
            setSelected(newSelection);
            onSelectionChange(newSelection);
        }
        setSearch("");
        setResults([]);
    };

    const handleRemove = (user: InviteCandidate) => {
        const newSelection = selected.filter((s) => s.did !== user.did);
        setSelected(newSelection);
        onSelectionChange(newSelection);
    };

    const withEffectiveStatus = (user: InviteCandidate): InviteCandidate => ({
        ...user,
        effectiveOccurrenceRsvpStatus:
            (user.did ? effectiveOccurrenceRsvpStatusByDid[user.did] : undefined) ??
            user.effectiveOccurrenceRsvpStatus,
    });
    const visibleResults = results
        .filter((user) => !selected.some((selectedUser) => selectedUser.did === user.did))
        .map(withEffectiveStatus);

    return (
        <div>
            <div className="flex flex-wrap gap-2 rounded-md border p-2">
                {selected.map(withEffectiveStatus).map((user) => (
                    <div key={user.did} className="flex items-center gap-2 rounded-full bg-secondary px-2 py-1 text-sm">
                        <Avatar className="h-6 w-6">
                            <AvatarImage src={user.picture?.url} />
                            <AvatarFallback>{user.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <span>{user.name}</span>
                        {effectiveRsvpLabel(user.effectiveOccurrenceRsvpStatus) && (
                            <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
                                {effectiveRsvpLabel(user.effectiveOccurrenceRsvpStatus)}
                            </Badge>
                        )}
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
            {visibleResults.length > 0 && (
                <ScrollArea className="mt-2 h-72 rounded-md border">
                    {visibleResults.map((user) => (
                        <div
                            key={user.did}
                            className="flex cursor-pointer items-center justify-between gap-3 p-2 hover:bg-muted"
                            onClick={() => handleSelect(user)}
                        >
                            <div className="flex min-w-0 items-center gap-3">
                                <Avatar>
                                    <AvatarImage src={user.picture?.url} />
                                    <AvatarFallback>{user.name?.[0]}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <p className="truncate font-semibold">{user.name}</p>
                                    <p className="truncate text-sm text-muted-foreground">@{user.handle}</p>
                                </div>
                            </div>
                            <div className="flex shrink-0 flex-wrap justify-end gap-1">
                                {effectiveRsvpLabel(user.effectiveOccurrenceRsvpStatus) && (
                                    <Badge variant="outline">
                                        {effectiveRsvpLabel(user.effectiveOccurrenceRsvpStatus)}
                                    </Badge>
                                )}
                                {user.inviteSourceLabel && <Badge variant="outline">{user.inviteSourceLabel}</Badge>}
                            </div>
                        </div>
                    ))}
                </ScrollArea>
            )}
        </div>
    );
}
