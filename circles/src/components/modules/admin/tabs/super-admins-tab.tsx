"use client";

import { useState, useEffect } from "react";
import { getSuperAdmins, toggleSuperAdmin, getEntitiesByType } from "../actions";
import { Circle } from "@/models/models";
import { Button } from "@/components/ui/button";
import { RefreshCw, Search, UserPlus, UserMinus, Check, X } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function SuperAdminsTab() {
    const [admins, setAdmins] = useState<Circle[]>([]);
    const [users, setUsers] = useState<Circle[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<Circle | null>(null);
    const [action, setAction] = useState<"add" | "remove" | null>(null);
    const [selectedUserId, setSelectedUserId] = useState<string>("");
    const { toast } = useToast();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [adminData, userData] = await Promise.all([getSuperAdmins(), getEntitiesByType("user")]);
            setAdmins(adminData as Circle[]);
            setUsers(userData as Circle[]);
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to fetch data",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleToggleAdmin = (user: Circle, makeAdmin: boolean) => {
        setSelectedUser(user);
        setAction(makeAdmin ? "add" : "remove");
        setConfirmDialogOpen(true);
    };

    const confirmToggleAdmin = async () => {
        if (!selectedUser) return;

        try {
            const isAdmin = action === "add";
            const result = await toggleSuperAdmin(selectedUser._id, isAdmin);

            if (result.success) {
                toast({
                    title: "Success",
                    description: result.message,
                });

                if (isAdmin) {
                    // Add to admins list
                    setAdmins([...admins, { ...selectedUser, isAdmin: true }]);
                } else {
                    // Remove from admins list
                    setAdmins(admins.filter((admin) => admin._id !== selectedUser._id));
                }

                // Update user in the users list
                setUsers(users.map((user) => (user._id === selectedUser._id ? { ...user, isAdmin } : user)));
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
                description: "Failed to update admin status",
                variant: "destructive",
            });
        } finally {
            setConfirmDialogOpen(false);
            setSelectedUser(null);
            setAction(null);
        }
    };

    const handleAddAdmin = () => {
        if (!selectedUserId) return;

        const user = users.find((u) => u._id === selectedUserId);
        if (user) {
            handleToggleAdmin(user, true);
        }
    };

    const filteredAdmins = admins.filter(
        (admin) =>
            admin.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            admin.handle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            admin.email?.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    // Filter out users who are already admins for the dropdown
    const nonAdminUsers = users.filter((user) => !user.isAdmin);

    return (
        <div className="space-y-6">
            <div className="mb-4 flex items-center justify-between">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search admins..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                    {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span className="ml-2">Refresh</span>
                </Button>
            </div>

            <div className="rounded-md border p-4">
                <h3 className="mb-4 text-lg font-medium">Add New Admin</h3>
                <div className="flex items-end gap-4">
                    <div className="flex-1">
                        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a user" />
                            </SelectTrigger>
                            <SelectContent>
                                {nonAdminUsers.length === 0 ? (
                                    <SelectItem value="none" disabled>
                                        No users available
                                    </SelectItem>
                                ) : (
                                    nonAdminUsers.map((user) => (
                                        <SelectItem key={user._id} value={user._id}>
                                            {user.name} ({user.handle})
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={handleAddAdmin} disabled={!selectedUserId || nonAdminUsers.length === 0}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Add Admin
                    </Button>
                </div>
            </div>

            <div>
                <h3 className="mb-4 text-lg font-medium">Current Admins</h3>
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
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredAdmins.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                                            {searchTerm ? "No admins found matching your search" : "No admins found"}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredAdmins.map((admin) => (
                                        <TableRow key={admin._id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center">
                                                    {admin.picture && (
                                                        <img
                                                            src={admin.picture.url}
                                                            alt={admin.name}
                                                            className="mr-2 h-8 w-8 rounded-full object-cover"
                                                        />
                                                    )}
                                                    {admin.name}
                                                </div>
                                            </TableCell>
                                            <TableCell>{admin.handle}</TableCell>
                                            <TableCell>{admin.email || "No email"}</TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleToggleAdmin(admin, false)}
                                                >
                                                    <UserMinus className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>

            <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Action</AlertDialogTitle>
                        <AlertDialogDescription>
                            {action === "add"
                                ? `Are you sure you want to make "${selectedUser?.name}" a super admin? They will have full access to all platform settings and data.`
                                : `Are you sure you want to remove "${selectedUser?.name}" as a super admin? They will lose access to admin features.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmToggleAdmin}
                            className={
                                action === "add" ? "bg-blue-500 hover:bg-blue-600" : "bg-red-500 hover:bg-red-600"
                            }
                        >
                            {action === "add" ? (
                                <>
                                    <Check className="mr-2 h-4 w-4" />
                                    Confirm
                                </>
                            ) : (
                                <>
                                    <X className="mr-2 h-4 w-4" />
                                    Remove
                                </>
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
