"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal } from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import type { UserGroup } from "@/models/models";
import type { MemberDirectoryManagementEntryDto, PublicMemberDirectoryEntryDto } from "@/lib/data/member-directory";
import InviteButton from "../home/invite-button";
import { UserPicture } from "./user-picture";
import { removeMemberAction, updateUserGroupsAction } from "./actions";

type DirectoryCircleDto = {
    id: string;
    handle: string;
    circleType?: "user" | "circle" | "project";
    userGroups?: UserGroup[];
};
type ManagementCapabilities = {
    canEditLower: boolean;
    canEditSameLevel: boolean;
    canRemoveLower: boolean;
    canRemoveSameLevel: boolean;
    viewerAccessLevel?: number;
};
type MemberTableProps = {
    members: Array<PublicMemberDirectoryEntryDto | MemberDirectoryManagementEntryDto>;
    management: ManagementCapabilities;
    circle: DirectoryCircleDto;
};

const memberAccessLevel = (member: MemberDirectoryManagementEntryDto, groups: UserGroup[]): number =>
    Math.min(
        ...member.userGroups.map((handle) => groups.find((group) => group.handle === handle)?.accessLevel ?? Infinity),
    );

export default function MembersTable({ circle, members, management }: MemberTableProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [query, setQuery] = useState("");
    const [selectedMember, setSelectedMember] = useState<MemberDirectoryManagementEntryDto | null>(null);
    const [removeOpen, setRemoveOpen] = useState(false);
    const [groupsOpen, setGroupsOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const { register, handleSubmit, reset } = useForm<{ userGroups: string[] }>({ defaultValues: { userGroups: [] } });
    const visibleMembers = useMemo(
        () =>
            members
                .map((member) => ({ member, managed: "userDid" in member ? member : undefined }))
                .filter(({ member }) => member.name.toLowerCase().includes(query.toLowerCase())),
        [members, query],
    );
    const groups = circle.userGroups ?? [];

    const rowCapabilities = (member?: MemberDirectoryManagementEntryDto) => {
        if (!member || management.viewerAccessLevel === undefined) return { canEdit: false, canRemove: false };
        const targetLevel = memberAccessLevel(member, groups);
        return {
            canEdit: management.canEditSameLevel
                ? management.viewerAccessLevel <= targetLevel
                : management.canEditLower && management.viewerAccessLevel < targetLevel,
            canRemove: management.canRemoveSameLevel
                ? management.viewerAccessLevel <= targetLevel
                : management.canRemoveLower && management.viewerAccessLevel < targetLevel,
        };
    };

    const runRemove = () => {
        if (!selectedMember) return;
        startTransition(async () => {
            const result = await removeMemberAction(selectedMember.userDid, circle.id);
            toast({
                title: result.success ? "Updated" : "Error",
                description: result.message || `${selectedMember.name} has been removed from the circle`,
                variant: result.success ? undefined : "destructive",
            });
            setRemoveOpen(false);
            if (result.success) router.refresh();
        });
    };

    const runGroupUpdate = ({ userGroups }: { userGroups: string[] }) => {
        if (!selectedMember) return;
        startTransition(async () => {
            const result = await updateUserGroupsAction(selectedMember.userDid, circle.id, userGroups ?? []);
            toast({
                title: result.success ? "Updated" : "Error",
                description: result.message || `${selectedMember.name}'s user groups have been updated`,
                variant: result.success ? undefined : "destructive",
            });
            setGroupsOpen(false);
            if (result.success) router.refresh();
        });
    };

    return (
        <div className="flex flex-1 flex-row justify-center">
            <div className="mb-4 ml-2 mr-2 mt-4 flex max-w-[1100px] flex-1 flex-col">
                <div className="flex w-full items-center gap-2">
                    <Input
                        placeholder={circle.circleType === "user" ? "Search follower..." : "Search member..."}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                    <InviteButton circle={{ handle: circle.handle, circleType: circle.circleType }} />
                </div>
                <div className="mt-3 overflow-hidden rounded-[15px] shadow-lg">
                    <Table>
                        <TableHeader className="bg-white">
                            <TableRow>
                                <TableHead>{circle.circleType === "user" ? "Follower" : "Member"}</TableHead>
                                <TableHead className="w-[40px]" />
                            </TableRow>
                        </TableHeader>
                        <TableBody className="bg-white">
                            {visibleMembers.length ? (
                                visibleMembers.map(({ member, managed }, index) => {
                                    const capabilities = rowCapabilities(managed);
                                    return (
                                        <TableRow
                                            key={`${member.handle ?? member.name}-${index}`}
                                            className={member.handle ? "cursor-pointer" : undefined}
                                            onClick={() => member.handle && router.push(`/circle/${member.handle}`)}
                                        >
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <UserPicture name={member.name} picture={member.picture?.url} />
                                                    <span className="font-bold">{member.name}</span>
                                                    {member.handle ? (
                                                        <span className="text-sm text-muted-foreground">
                                                            @{member.handle}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </TableCell>
                                            <TableCell onClick={(event) => event.stopPropagation()}>
                                                {(capabilities.canEdit || capabilities.canRemove) && managed ? (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" className="h-8 w-8 p-0">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                                <span className="sr-only">Open menu</span>
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                            <DropdownMenuSeparator />
                                                            {capabilities.canEdit ? (
                                                                <DropdownMenuItem
                                                                    onClick={() => {
                                                                        setSelectedMember(managed);
                                                                        reset({ userGroups: managed.userGroups });
                                                                        setGroupsOpen(true);
                                                                    }}
                                                                >
                                                                    Edit User Groups
                                                                </DropdownMenuItem>
                                                            ) : null}
                                                            {capabilities.canRemove ? (
                                                                <DropdownMenuItem
                                                                    onClick={() => {
                                                                        setSelectedMember(managed);
                                                                        setRemoveOpen(true);
                                                                    }}
                                                                >
                                                                    Remove User
                                                                </DropdownMenuItem>
                                                            ) : null}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                ) : null}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={2} className="h-24 text-center">
                                        {circle.circleType === "user" ? "No followers." : "No members."}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Are you sure?</DialogTitle>
                            <DialogDescription>
                                Do you want to remove <b>{selectedMember?.name}</b> from the circle?
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button variant="outline">Cancel</Button>
                            </DialogClose>
                            <Button variant="destructive" onClick={runRemove} disabled={isPending}>
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
                <Dialog open={groupsOpen} onOpenChange={setGroupsOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Edit User Groups</DialogTitle>
                            <DialogDescription>Edit user groups for {selectedMember?.name}.</DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit(runGroupUpdate)} className="space-y-4">
                            {groups.map((group) => (
                                <label key={group.handle} className="flex items-center gap-2">
                                    <input type="checkbox" value={group.handle} {...register("userGroups")} />
                                    {group.name}
                                </label>
                            ))}
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button variant="outline">Cancel</Button>
                                </DialogClose>
                                <Button type="submit" disabled={isPending}>
                                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
