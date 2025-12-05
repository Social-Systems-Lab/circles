"use client";

import { useState, useEffect, useRef } from "react";
import { Users, Image as ImageIcon, Settings as SettingsIcon, Info, Search, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatRoomDisplay } from "@/models/models";
import { CirclePicture } from "../circles/circle-picture";

interface GroupSettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    chatRoom: ChatRoomDisplay;
    isAdmin: boolean;
}

export function GroupSettingsModal({ open, onOpenChange, chatRoom, isAdmin }: GroupSettingsModalProps) {
    const [activeTab, setActiveTab] = useState("info");

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                        <span>{chatRoom.isDirect ? "Chat Info" : "Group Info"}</span>

                    </DialogTitle>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="info" className="flex items-center gap-2">
                            <Info className="h-4 w-4" />
                            <span className="hidden sm:inline">Info</span>
                        </TabsTrigger>
                        <TabsTrigger value="members" className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            <span className="hidden sm:inline">Members</span>
                        </TabsTrigger>
                        <TabsTrigger value="media" className="flex items-center gap-2">
                            <ImageIcon className="h-4 w-4" />
                            <span className="hidden sm:inline">Media</span>
                        </TabsTrigger>
                        <TabsTrigger value="settings" className="flex items-center gap-2">
                            <SettingsIcon className="h-4 w-4" />
                            <span className="hidden sm:inline">Settings</span>
                        </TabsTrigger>
                    </TabsList>

                    <div className="flex-1 overflow-y-auto mt-4">
                        <TabsContent value="info" className="mt-0">
                            <InfoTab chatRoom={chatRoom} isAdmin={isAdmin} />
                        </TabsContent>

                        <TabsContent value="members" className="mt-0">
                            <MembersTab chatRoom={chatRoom} isAdmin={isAdmin} />
                        </TabsContent>

                        <TabsContent value="media" className="mt-0">
                            <MediaTab chatRoom={chatRoom} />
                        </TabsContent>

                        <TabsContent value="settings" className="mt-0">
                            <SettingsTab chatRoom={chatRoom} isAdmin={isAdmin} />
                        </TabsContent>
                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

// Info Tab Component
function InfoTab({ chatRoom, isAdmin }: { chatRoom: ChatRoomDisplay; isAdmin: boolean }) {
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(chatRoom.name);
    const [editedDescription, setEditedDescription] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const { updateGroupInfoAction } = await import("./actions");
            const result = await updateGroupInfoAction(chatRoom._id as string, {
                name: editedName,
                description: editedDescription,
            });

            if (result.success) {
                setIsEditing(false);
                // Refresh the page to show updated info
                window.location.reload();
            } else {
                alert(result.message || "Failed to update group info");
            }
        } catch (error) {
            console.error("Error updating group info:", error);
            alert("Failed to update group info");
        } finally {
            setIsSaving(false);
        }
    };

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset input value to allow selecting same file again
        e.target.value = "";

        setIsSaving(true);
        try {
            const formData = new FormData();
            formData.append("chatRoomId", chatRoom._id as string);
            formData.append("file", file);

            const { updateGroupAvatarAction } = await import("./actions");
            const result = await updateGroupAvatarAction(formData);

            if (result.success) {
                window.location.reload();
            } else {
                alert(result.message || "Failed to update avatar");
            }
        } catch (error) {
            console.error("Error updating avatar:", error);
            alert("Failed to update avatar");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setEditedName(chatRoom.name);
        setEditedDescription("");
        setIsEditing(false);
    };

    return (
        <div className="space-y-6">
            {/* Group Avatar */}
            <div className="flex flex-col items-center gap-4">
                <CirclePicture
                    circle={{
                        name: chatRoom.name,
                        picture: chatRoom.picture,
                        circleType: "circle",
                    }}
                    size="120px"
                />
                {isAdmin && (
                    <>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={handleFileChange}
                        />
                        <button 
                            onClick={handleAvatarClick}
                            disabled={isSaving}
                            className="text-sm text-blue-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? "Uploading..." : "Change Photo"}
                        </button>
                    </>
                )}
            </div>

            {/* Group Name */}
            <div>
                <label className="text-sm font-medium text-gray-500">Group Name</label>
                <div className="mt-1">
                    {isAdmin && isEditing ? (
                        <input
                            type="text"
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Group name"
                        />
                    ) : (
                        <p className="text-lg font-medium">{chatRoom.name}</p>
                    )}
                </div>
            </div>

            {/* Group Description */}
            <div>
                <label className="text-sm font-medium text-gray-500">Description</label>
                <div className="mt-1">
                    {isAdmin && isEditing ? (
                        <textarea
                            value={editedDescription}
                            onChange={(e) => setEditedDescription(e.target.value)}
                            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Add group description"
                            rows={3}
                        />
                    ) : (
                        <p className="text-sm text-gray-600">
                            {editedDescription || "No description"}
                        </p>
                    )}
                </div>
            </div>

            {/* Edit/Save/Cancel Buttons */}
            {isAdmin && (
                <div className="flex gap-2">
                    {isEditing ? (
                        <>
                            <button
                                onClick={handleSave}
                                disabled={isSaving || !editedName.trim()}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? "Saving..." : "Save"}
                            </button>
                            <button
                                onClick={handleCancel}
                                disabled={isSaving}
                                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                            Edit Info
                        </button>
                    )}
                </div>
            )}

            {/* Group Info */}
            <div className="space-y-2 text-sm text-gray-600">
                <p>Created {new Date(chatRoom.createdAt).toLocaleDateString()}</p>
                <p>Group · 0 members</p>
            </div>
        </div>
    );
}

// Members Tab Component
function MembersTab({ chatRoom, isAdmin }: { chatRoom: ChatRoomDisplay; isAdmin: boolean }) {
    const [members, setMembers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchMembers = async () => {
            setIsLoading(true);
            try {
                const { getChatRoomMembersAction } = await import("./actions");
                const result = await getChatRoomMembersAction(chatRoom._id as string);
                
                if (result.success && result.members) {
                    setMembers(result.members);
                } else {
                    setError(result.message || "Failed to load members");
                }
            } catch (err) {
                console.error("Error fetching members:", err);
                setError("Failed to load members");
            } finally {
                setIsLoading(false);
            }
        };

        fetchMembers();
    }, [chatRoom._id]);

    const handlePromote = async (memberDid: string) => {
        if (!confirm("Are you sure you want to make this user an admin?")) {
            return;
        }

        try {
            const { promoteMemberAction } = await import("./actions");
            const result = await promoteMemberAction(chatRoom._id as string, memberDid);
            
            if (result.success) {
                // Refresh members list
                const { getChatRoomMembersAction } = await import("./actions");
                const refreshResult = await getChatRoomMembersAction(chatRoom._id as string);
                if (refreshResult.success && refreshResult.members) {
                    setMembers(refreshResult.members);
                }
            } else {
                alert(result.message || "Failed to promote member");
            }
        } catch (error) {
            console.error("Error promoting member:", error);
            alert("Failed to promote member");
        }
    };

    const handleRemove = async (memberDid: string) => {
        if (!confirm("Are you sure you want to remove this member?")) {
            return;
        }

        try {
            const { removeMemberAction } = await import("./actions");
            const result = await removeMemberAction(chatRoom._id as string, memberDid);
            
            if (result.success) {
                // Refresh members list
                const { getChatRoomMembersAction } = await import("./actions");
                const refreshResult = await getChatRoomMembersAction(chatRoom._id as string);
                if (refreshResult.success && refreshResult.members) {
                    setMembers(refreshResult.members);
                }
            } else {
                alert(result.message || "Failed to remove member");
            }
        } catch (error) {
            console.error("Error removing member:", error);
            alert("Failed to remove member");
        }
    };

    const [isAddingMembers, setIsAddingMembers] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
    const [isSavingMembers, setIsSavingMembers] = useState(false);

    const filteredUsers = allUsers.filter(u => {
        // Exclude existing members
        if (members.some(m => m.userDid === u.did)) return false;
        
        const term = searchTerm.toLowerCase();
        return u.name?.toLowerCase().includes(term) || u.handle?.toLowerCase().includes(term);
    });

    const handleAddMembersClick = async () => {
        setIsAddingMembers(true);
        // Fetch all users if not already fetched
        if (allUsers.length === 0) {
            try {
                const { getAllUsersAction } = await import("./actions");
                const users = await getAllUsersAction();
                setAllUsers(users || []);
            } catch (err) {
                console.error("Error fetching users:", err);
            }
        }
    };

    const toggleUserSelection = (user: any) => {
        if (selectedUsers.find(u => u._id === user._id)) {
            setSelectedUsers(selectedUsers.filter(u => u._id !== user._id));
        } else {
            setSelectedUsers([...selectedUsers, user]);
        }
    };

    const confirmAddMembers = async () => {
        if (selectedUsers.length === 0) return;

        setIsSavingMembers(true);
        try {
            const { addMembersAction } = await import("./actions");
            const result = await addMembersAction(
                chatRoom._id as string,
                selectedUsers.map(u => u.did)
            );

            if (result.success) {
                // Refresh members
                const { getChatRoomMembersAction } = await import("./actions");
                const refreshResult = await getChatRoomMembersAction(chatRoom._id as string);
                if (refreshResult.success && refreshResult.members) {
                    setMembers(refreshResult.members);
                }
                // Reset UI
                setIsAddingMembers(false);
                setSelectedUsers([]);
                setSearchTerm("");
            } else {
                alert(result.message || "Failed to add members");
            }
        } catch (error) {
            console.error("Error adding members:", error);
            alert("Failed to add members");
        } finally {
            setIsSavingMembers(false);
        }
    };

    if (isAddingMembers) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <button 
                        onClick={() => setIsAddingMembers(false)}
                        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    >
                        Start Adding
                    </button>
                    <span className="font-semibold">Add Members</span>
                    <button 
                        onClick={() => setIsAddingMembers(false)} // Close icon logic
                        className="opacity-0 cursor-default"
                    >
                        Close
                    </button>
                </div>

                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        placeholder="Search people..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-8 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div className="flex gap-2 flex-wrap">
                    {selectedUsers.map(u => (
                         <div key={u._id} className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                             <span>{u.name}</span>
                             <button onClick={() => toggleUserSelection(u)}><X className="h-3 w-3" /></button>
                         </div>
                    ))}
                </div>

                <div className="h-[200px] overflow-y-auto space-y-1 border rounded-md p-2">
                    {filteredUsers.length === 0 ? (
                        <p className="text-center text-gray-500 text-sm py-4">No users found</p>
                    ) : (
                        filteredUsers.map(u => {
                            const isSelected = selectedUsers.some(s => s._id === u._id);
                            return (
                                <div 
                                    key={u._id}
                                    onClick={() => toggleUserSelection(u)}
                                    className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-gray-50 ${isSelected ? "bg-blue-50" : ""}`}
                                >
                                    <div className="w-8 h-8 rounded-full bg-gray-300 overflow-hidden">
                                         {u.picture?.url ? (
                                             <img src={u.picture.url} alt={u.name} className="w-full h-full object-cover" />
                                         ) : (
                                             <div className="flex items-center justify-center h-full text-xs">{u.name?.[0]}</div>
                                         )}
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <p className="text-sm font-medium truncate">{u.name}</p>
                                        <p className="text-xs text-gray-500 truncate">@{u.handle}</p>
                                    </div>
                                    {isSelected && <Check className="h-4 w-4 text-blue-600" />}
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="flex gap-2 justify-end pt-2 border-t">
                    <button
                        onClick={() => setIsAddingMembers(false)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={confirmAddMembers}
                        disabled={selectedUsers.length === 0 || isSavingMembers}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                        {isSavingMembers ? "Adding..." : `Add ${selectedUsers.length > 0 ? selectedUsers.length : ""} Members`}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {isAdmin && (
                <button 
                    onClick={handleAddMembersClick}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors"
                >
                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                        <Users className="h-5 w-5 text-white" />
                    </div>
                    <span className="font-medium">Add Members</span>
                </button>
            )}

            <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-500">
                    {members.length} {members.length === 1 ? "Member" : "Members"}
                </h3>
                
                {isLoading ? (
                    <p className="text-sm text-gray-500">Loading members...</p>
                ) : error ? (
                    <p className="text-sm text-red-500">{error}</p>
                ) : members.length === 0 ? (
                    <p className="text-sm text-gray-500">No members found</p>
                ) : (
                    <div className="space-y-2">
                        {members.map((member) => (
                            <div
                                key={member._id}
                                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center overflow-hidden">
                                        {member.user?.picture?.url ? (
                                            <img
                                                src={member.user.picture.url}
                                                alt={member.user.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-lg font-medium text-gray-600">
                                                {member.user?.name?.[0]?.toUpperCase() || "?"}
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium">{member.user?.name || "Unknown"}</p>
                                            {member.role === "admin" && (
                                                <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full border border-blue-200">
                                                    Admin
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-500">@{member.user?.handle || "unknown"}</p>
                                    </div>
                                </div>
                                {isAdmin && (
                                    <div className="flex items-center gap-2">
                                        {member.role !== "admin" && (
                                            <button 
                                                onClick={() => handlePromote(member.userDid)}
                                                className="px-3 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
                                            >
                                                Make admin
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => handleRemove(member.userDid)}
                                            className="text-sm text-red-600 hover:underline"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// Media Tab Component
function MediaTab({ chatRoom }: { chatRoom: ChatRoomDisplay }) {
    return (
        <div className="space-y-4">
            <div className="flex gap-2 border-b">
                <button className="px-4 py-2 border-b-2 border-blue-500 font-medium">
                    Images
                </button>
                <button className="px-4 py-2 text-gray-500 hover:text-gray-700">
                    Videos
                </button>
                <button className="px-4 py-2 text-gray-500 hover:text-gray-700">
                    Files
                </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
                <p className="col-span-3 text-center text-sm text-gray-500 py-8">
                    No media shared yet
                </p>
            </div>
        </div>
    );
}

// Settings Tab Component
function SettingsTab({ chatRoom, isAdmin }: { chatRoom: ChatRoomDisplay; isAdmin: boolean }) {
    const [isLeaving, setIsLeaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleLeaveGroup = async () => {
        if (!confirm(`Are you sure you want to leave this ${chatRoom.isDirect ? "chat" : "group"}?`)) {
            return;
        }

        setIsLeaving(true);
        try {
            const { leaveGroupChatAction } = await import("./actions");
            const result = await leaveGroupChatAction(chatRoom._id as string);
            
            if (result.success) {
                // Close modal and refresh
                window.location.href = "/chat";
            } else {
                alert(result.message || "Failed to leave group");
            }
        } catch (error) {
            console.error("Error leaving group:", error);
            alert("Failed to leave group");
        } finally {
            setIsLeaving(false);
        }
    };

    const handleDeleteGroup = async () => {
        if (!confirm("Are you sure you want to delete this group? This action cannot be undone.")) {
            return;
        }

        setIsDeleting(true);
        try {
            const { deleteGroupChatAction } = await import("./actions");
            const result = await deleteGroupChatAction(chatRoom._id as string);
            
            if (result.success) {
                // Close modal and refresh
                window.location.href = "/chat";
            } else {
                alert(result.message || "Failed to delete group");
            }
        } catch (error) {
            console.error("Error deleting group:", error);
            alert("Failed to delete group");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Mute Notifications */}
            <div className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50">
                <div>
                    <p className="font-medium">Mute Notifications</p>
                    <p className="text-sm text-gray-500">Silence notifications from this chat</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
            </div>

            {/* Leave Group */}
            <button 
                onClick={handleLeaveGroup}
                disabled={isLeaving}
                className="w-full p-3 text-left rounded-lg hover:bg-red-50 text-red-600 font-medium transition-colors disabled:opacity-50"
            >
                {isLeaving ? "Leaving..." : `Leave ${chatRoom.isDirect ? "Chat" : "Group"}`}
            </button>

            {/* Delete Group (Admin Only) */}
            {isAdmin && !chatRoom.isDirect && (
                <button 
                    onClick={handleDeleteGroup}
                    disabled={isDeleting}
                    className="w-full p-3 text-left rounded-lg hover:bg-red-50 text-red-600 font-medium transition-colors disabled:opacity-50"
                >
                    {isDeleting ? "Deleting..." : "Delete Group"}
                </button>
            )}
        </div>
    );
}
