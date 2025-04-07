"use client";

import { useState, useEffect, useTransition } from "react"; // Added useTransition
import { getEntitiesByType, deleteEntity } from "../actions";
import { initiatePasswordReset } from "@/lib/auth/actions"; // Import the new action
import { Circle } from "@/models/models";
import { Button } from "@/components/ui/button";
import { Trash2, RefreshCw, Search, KeyRound } from "lucide-react"; // Added KeyRound icon
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function UsersTab() {
    const [users, setUsers] = useState<Circle[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<Circle | null>(null);
    const [isResetting, startResetTransition] = useTransition(); // Transition for reset action
    const { toast } = useToast();

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const data = await getEntitiesByType("user");
            setUsers(data as Circle[]);
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to fetch users",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (user: Circle) => {
        setUserToDelete(user);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!userToDelete) return;

        try {
            const result = await deleteEntity(userToDelete._id);

            if (result.success) {
                toast({
                    title: "Success",
                    description: `User "${userToDelete.name}" has been deleted`,
                });
                // Remove from local state
                setUsers(users.filter((u) => u._id !== userToDelete._id));
            } else {
                toast({
                    title: "Error",
                    description: result.message,
                    variant: "destructive",
                });
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to delete user",
                variant: "destructive",
            });
        } finally {
            setDeleteDialogOpen(false);
            setUserToDelete(null);
        }
    };

    const handleResetPasswordClick = async (user: Circle) => {
        if (!user._id) return;

        startResetTransition(async () => {
            try {
                const result = await initiatePasswordReset(user._id);

                if (result.success) {
                    const resetLink = `${window.location.origin}/reset-password?token=${result.token}`;
                    // Display link in a toast - consider a dialog or copy-to-clipboard for better UX
                    toast({
                        title: "Password Reset Initiated",
                        description: (
                            <div>
                                <p>Reset link for {user.name}:</p>
                                <Input readOnly value={resetLink} className="mt-2" />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Copy this link and send it to the user. It expires in 1 hour.
                                </p>
                            </div>
                        ),
                        duration: 15000, // Keep toast longer
                    });
                } else {
                    toast({
                        title: "Error",
                        description: result.error || "Failed to initiate password reset.",
                        variant: "destructive",
                    });
                }
            } catch (error) {
                console.error("Reset password error:", error);
                toast({
                    title: "Error",
                    description: "An unexpected error occurred during password reset.",
                    variant: "destructive",
                });
            }
        });
    };

    const filteredUsers = users.filter(
        (user) =>
            user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.handle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email?.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    return (
        <div className="space-y-4">
            <div className="mb-4 flex items-center justify-between">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search users..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
                    {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span className="ml-2">Refresh</span>
                </Button>
            </div>

            {loading ? (
                <div className="flex h-64 items-center justify-center">
                    <RefreshCw className="h-8 w-8 animate-spin" />
                </div>
            ) : (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Handle</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Admin</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredUsers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                                        {searchTerm ? "No users found matching your search" : "No users found"}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredUsers.map((user) => (
                                    <TableRow key={user._id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center">
                                                {user.picture && (
                                                    <img
                                                        src={user.picture.url}
                                                        alt={user.name}
                                                        className="mr-2 h-8 w-8 rounded-full object-cover"
                                                    />
                                                )}
                                                {user.name}
                                            </div>
                                        </TableCell>
                                        <TableCell>{user.handle}</TableCell>
                                        <TableCell>{user.email || "No email"}</TableCell>
                                        <TableCell>
                                            {user.isAdmin ? (
                                                <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                                                    Yes
                                                </span>
                                            ) : (
                                                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                                                    No
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Unknown"}
                                        </TableCell>
                                        <TableCell className="space-x-1 text-right">
                                            {/* Reset Password Button */}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleResetPasswordClick(user)}
                                                disabled={isResetting}
                                                title="Reset Password"
                                            >
                                                {isResetting ? (
                                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <KeyRound className="h-4 w-4 text-blue-500" />
                                                )}
                                            </Button>
                                            {/* Delete Button */}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteClick(user)}
                                                title="Delete User"
                                            >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the user &quot;{userToDelete?.name}&quot; and all associated
                            data. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-500 hover:bg-red-600">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
