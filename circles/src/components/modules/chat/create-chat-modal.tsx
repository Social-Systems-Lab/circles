"use client";

import { useState, useEffect, useMemo } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { Circle } from "@/models/models";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
import { useRouter } from "next/navigation";
import { getChatContactsAction, createMongoGroupChatAction } from "./actions";
import { getUserPrivateAction } from "../home/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Users, ArrowLeft, X, Check, Search, Camera } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { openNewDmComposerAction } from "./draft-actions";

interface CreateChatModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Step = "select-type" | "select-members" | "group-details";

export function CreateChatModal({ isOpen, onClose }: CreateChatModalProps) {
    const [user, setUser] = useAtom(userAtom);
    const router = useRouter();
    const { toast } = useToast();

    const [step, setStep] = useState<Step>("select-type");
    const [searchTerm, setSearchTerm] = useState("");
    const [allUsers, setAllUsers] = useState<Circle[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [selectedMembers, setSelectedMembers] = useState<Circle[]>([]);
    const [groupName, setGroupName] = useState("");
    const [groupAvatar, setGroupAvatar] = useState<File | null>(null);
    const [groupAvatarPreview, setGroupAvatarPreview] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        if (isOpen && allUsers.length === 0) {
            fetchUsers();
        }
        if (!isOpen) {
            // Reset state on close
            setStep("select-type");
            setSearchTerm("");
            setSelectedMembers([]);
            setGroupName("");
            setGroupAvatar(null);
            setGroupAvatarPreview(null);
        }
    }, [isOpen, allUsers.length]);

    const fetchUsers = async () => {
        try {
            setIsLoadingUsers(true);
            const users = await getChatContactsAction();
            setAllUsers(users || []);
        } catch (err) {
            console.error("Error fetching users:", err);
        } finally {
            setIsLoadingUsers(false);
        }
    };

    const filteredUsers = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();

        return allUsers.filter((u) => {
            // Exclude self
            if (u._id && user?._id && String(u._id) === String(user._id)) {
                return false;
            }
            if (!term) return true;

            const nameMatch = u.name?.toLowerCase().includes(term);
            const handleMatch = u.handle?.toLowerCase().includes(term);

            return nameMatch || handleMatch;
        });
    }, [allUsers, searchTerm, user?._id]);

    const handleUserClick = async (clickedUser: Circle) => {
        if (step === "select-type") {
            const result = await openNewDmComposerAction(clickedUser.did || "");
            if (!result.success) {
                toast({
                    title: "Could not start chat",
                    description: result.message || "Failed to open the direct message",
                    variant: "destructive",
                });
                return;
            }
            onClose();
            router.push(
                result.destination === "conversation"
                    ? `/chat/${result.conversationId}`
                    : `/chat/new/${encodeURIComponent(clickedUser.did || "")}`,
            );
            return;
        }

        if (step === "select-members") {
            toggleMemberSelection(clickedUser);
        }
    };

    const toggleMemberSelection = (member: Circle) => {
        if (selectedMembers.find((m) => m._id === member._id)) {
            setSelectedMembers(selectedMembers.filter((m) => m._id !== member._id));
        } else {
            setSelectedMembers([...selectedMembers, member]);
        }
    };

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setGroupAvatar(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setGroupAvatarPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleCreateGroup = async () => {
        if (!groupName.trim()) return;
        if (selectedMembers.length === 0) return;

        setIsCreating(true);
        try {
            const formData = new FormData();
            formData.append("name", groupName);
            formData.append("participants", JSON.stringify(selectedMembers.map((m) => m.did)));
            if (groupAvatar) {
                formData.append("avatar", groupAvatar);
            }

            const result = await createMongoGroupChatAction(formData);

            if (result.success && result.roomId) {
                toast({
                    title: "Success",
                    description: "Group chat created!",
                });

                // Fetch updated user to get new membership
                const updatedUser = await getUserPrivateAction();
                if (updatedUser) {
                    setUser(updatedUser);
                }

                onClose();
                router.refresh(); // Refresh to get new memberships
            } else {
                toast({
                    title: "Error",
                    description: result.message || "Failed to create group",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Error creating group:", error);
            toast({
                title: "Error",
                description: "An unexpected error occurred",
                variant: "destructive",
            });
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[425px]">
                <DialogHeader className="border-b p-4">
                    <div className="flex items-center gap-2">
                        {step !== "select-type" && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setStep(step === "group-details" ? "select-members" : "select-type")}
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        )}
                        <DialogTitle>
                            {step === "select-type" && "New Message"}
                            {step === "select-members" && "Add Members"}
                            {step === "group-details" && "New Group"}
                        </DialogTitle>
                    </div>
                </DialogHeader>

                {step === "group-details" ? (
                    <div className="flex flex-col gap-6 p-6">
                        <div className="flex justify-center">
                            <div className="relative">
                                <Avatar className="h-24 w-24 cursor-pointer transition-opacity hover:opacity-90">
                                    <AvatarImage src={groupAvatarPreview || ""} />
                                    <AvatarFallback className="bg-muted">
                                        <Camera className="h-8 w-8 text-muted-foreground" />
                                    </AvatarFallback>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="absolute inset-0 cursor-pointer opacity-0"
                                        onChange={handleAvatarChange}
                                    />
                                </Avatar>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Input
                                placeholder="Group Name (Required)"
                                value={groupName}
                                onChange={(e) => setGroupName(e.target.value)}
                                className="text-lg"
                            />
                        </div>
                        <div className="flex justify-end">
                            <Button
                                onClick={handleCreateGroup}
                                disabled={!groupName.trim() || isCreating}
                                className="w-full"
                            >
                                {isCreating ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    "Create Group"
                                )}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex h-[400px] flex-col">
                        <div className="border-b p-2">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search people..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="border-none bg-muted/50 pl-8 focus-visible:ring-0"
                                />
                            </div>
                        </div>

                        <ScrollArea className="flex-1">
                            <div className="p-2">
                                {step === "select-type" && !searchTerm && (
                                    <Button
                                        variant="ghost"
                                        className="h-auto w-full justify-start gap-3 p-3 font-normal"
                                        onClick={() => setStep("select-members")}
                                    >
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                                            <Users className="h-5 w-5" />
                                        </div>
                                        <div className="flex flex-col items-start">
                                            <span className="font-medium">New Group</span>
                                        </div>
                                    </Button>
                                )}

                                {step === "select-members" && selectedMembers.length > 0 && (
                                    <div className="mb-2 flex gap-2 overflow-x-auto p-2">
                                        {selectedMembers.map((member) => (
                                            <div
                                                key={member._id}
                                                className="relative flex min-w-[60px] flex-col items-center"
                                            >
                                                <div className="relative">
                                                    <CirclePicture circle={member} size="40px" />
                                                    <button
                                                        className="absolute -right-1 -top-1 rounded-full bg-gray-500 p-0.5 text-white hover:bg-gray-600"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleMemberSelection(member);
                                                        }}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                </div>
                                                <span className="mt-1 max-w-[60px] truncate text-xs">
                                                    {member.name?.split(" ")[0]}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="mt-2 space-y-1">
                                    {isLoadingUsers ? (
                                        <div className="flex justify-center p-4">
                                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : filteredUsers.length === 0 ? (
                                        <div className="p-4 text-center text-sm text-muted-foreground">
                                            No contacts yet
                                        </div>
                                    ) : (
                                        filteredUsers.map((u) => {
                                            const isSelected = selectedMembers.some((m) => m._id === u._id);
                                            return (
                                                <Button
                                                    key={u._id}
                                                    variant="ghost"
                                                    className="relative h-auto w-full justify-start gap-3 p-2 font-normal"
                                                    onClick={() => void handleUserClick(u)}
                                                >
                                                    <CirclePicture circle={u} size="40px" />
                                                    <div className="flex flex-col items-start overflow-hidden">
                                                        <span className="w-full truncate text-left font-medium">
                                                            {u.name}
                                                        </span>
                                                        <span className="w-full truncate text-left text-xs text-muted-foreground">
                                                            @{u.handle}
                                                        </span>
                                                    </div>
                                                    {step === "select-members" && isSelected && (
                                                        <div className="absolute right-4 text-primary">
                                                            <Check className="h-5 w-5" />
                                                        </div>
                                                    )}
                                                </Button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </ScrollArea>

                        {step === "select-members" && (
                            <div className="border-t bg-background p-4">
                                <Button
                                    className="w-full"
                                    disabled={selectedMembers.length === 0}
                                    onClick={() => setStep("group-details")}
                                >
                                    Next ({selectedMembers.length})
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
