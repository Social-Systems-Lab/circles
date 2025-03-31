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

export default function ProjectsTab() {
    const [projects, setProjects] = useState<Circle[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState<Circle | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const data = await getEntitiesByType("project");
            setProjects(data as Circle[]);
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to fetch projects",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (project: Circle) => {
        setProjectToDelete(project);
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        if (!projectToDelete) return;

        try {
            const result = await deleteEntity(projectToDelete._id);

            if (result.success) {
                toast({
                    title: "Success",
                    description: `Project "${projectToDelete.name}" has been deleted`,
                });
                // Remove from local state
                setProjects(projects.filter((p) => p._id !== projectToDelete._id));
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
                description: "Failed to delete project",
                variant: "destructive",
            });
        } finally {
            setDeleteDialogOpen(false);
            setProjectToDelete(null);
        }
    };

    const filteredProjects = projects.filter(
        (project) =>
            project.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            project.handle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            project.description?.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    return (
        <div className="space-y-4">
            <div className="mb-4 flex items-center justify-between">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search projects..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button variant="outline" size="sm" onClick={fetchProjects} disabled={loading}>
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
                            {filteredProjects.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                                        {searchTerm ? "No projects found matching your search" : "No projects found"}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredProjects.map((project) => (
                                    <TableRow key={project._id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center">
                                                {project.picture && (
                                                    <img
                                                        src={project.picture.url}
                                                        alt={project.name}
                                                        className="mr-2 h-8 w-8 rounded-full object-cover"
                                                    />
                                                )}
                                                {project.name}
                                            </div>
                                        </TableCell>
                                        <TableCell>{project.handle}</TableCell>
                                        <TableCell className="max-w-xs truncate">
                                            {project.description || "No description"}
                                        </TableCell>
                                        <TableCell>{project.members || 0}</TableCell>
                                        <TableCell>
                                            {project.createdAt
                                                ? new Date(project.createdAt).toLocaleDateString()
                                                : "Unknown"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteClick(project)}
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
                            This will permanently delete the project "{projectToDelete?.name}" and all associated data.
                            This action cannot be undone.
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
