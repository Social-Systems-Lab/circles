"use client";

import { useState, useEffect } from "react";
import { getEntitiesByType, deleteEntity } from "../actions";
import { Circle } from "@/models/models";
import { Button } from "@/components/ui/button";
import { Trash2, RefreshCw, Search } from "lucide-react";
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
import { useSetAtom } from "jotai";
import { contentPreviewAtom } from "@/lib/data/atoms";
import { getCircleByIdAction } from "../actions";

export default function CirclesTab() {
    const [circles, setCircles] = useState<Circle[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [circleToDelete, setCircleToDelete] = useState<Circle | null>(null);
    const { toast } = useToast();
    const setContentPreview = useSetAtom(contentPreviewAtom);

    useEffect(() => {
        fetchCircles();
    }, []);

    const fetchCircles = async () => {
        try {
            setLoading(true);
            const data = await getEntitiesByType("circle");
            setCircles(data as Circle[]);
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to fetch circles",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (circle: Circle) => {
        setCircleToDelete(circle);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!circleToDelete) return;

        try {
            const result = await deleteEntity(circleToDelete._id);

            if (result.success) {
                toast({
                    title: "Success",
                    description: `Circle "${circleToDelete.name}" has been deleted`,
                });
                // Remove from local state
                setCircles(circles.filter((c) => c._id !== circleToDelete._id));
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
                description: "Failed to delete circle",
                variant: "destructive",
            });
        } finally {
            setDeleteDialogOpen(false);
            setCircleToDelete(null);
        }
    };

    const filteredCircles = circles.filter(
        (circle) =>
            circle.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            circle.handle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            circle.description?.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    const handlePreview = async (id: string) => {
        const circle = await getCircleByIdAction(id);
        setContentPreview({ type: "circle", content: circle });
    };

    return (
        <div className="space-y-4">
            <div className="mb-4 flex items-center justify-between">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search communities..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button variant="outline" size="sm" onClick={fetchCircles} disabled={loading}>
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
                                <TableHead>Description</TableHead>
                                <TableHead>Members</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredCircles.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                                        {searchTerm
                                            ? "No communities found matching your search"
                                            : "No communities found"}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredCircles.map((circle) => (
                                    <TableRow key={circle._id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2">
                                                {circle.picture && (
                                                    <img
                                                        src={circle.picture.url}
                                                        alt={circle.name}
                                                        className="h-8 w-8 rounded-full object-cover"
                                                    />
                                                )}
                                                {circle.name}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handlePreview(circle._id!)}
                                                >
                                                    Preview
                                                </Button>
                                            </div>
                                        </TableCell>
                                        <TableCell>{circle.handle}</TableCell>
                                        <TableCell className="max-w-xs truncate">
                                            {circle.description ?? circle.mission}
                                        </TableCell>
                                        <TableCell>{circle.members || 0}</TableCell>
                                        <TableCell>
                                            {circle.createdAt
                                                ? new Date(circle.createdAt).toLocaleDateString()
                                                : "Unknown"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(circle)}>
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
                            This will permanently delete the circle &quot;{circleToDelete?.name}&quot; and all
                            associated data. This action cannot be undone.
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
