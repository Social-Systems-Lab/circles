"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DynamicForm from "@/components/forms/dynamic-form";
import { ServerSettings } from "@/models/models";
import CirclesTab from "./tabs/circles-tab";
import UsersTab from "./tabs/users-tab";
import ProjectsTab from "./tabs/projects-tab";
import SuperAdminsTab from "./tabs/super-admins-tab";

interface AdminDashboardProps {
    serverSettings: ServerSettings;
}

export default function AdminDashboard({ serverSettings }: AdminDashboardProps) {
    const [activeTab, setActiveTab] = useState("server-settings");

    return (
        <Tabs defaultValue="server-settings" className="w-full" onValueChange={setActiveTab}>
            <TabsList className="mb-6">
                <TabsTrigger value="server-settings">Server Settings</TabsTrigger>
                <TabsTrigger value="circles">Circles</TabsTrigger>
                <TabsTrigger value="users">Users</TabsTrigger>
                <TabsTrigger value="projects">Projects</TabsTrigger>
                <TabsTrigger value="super-admins">Super Admins</TabsTrigger>
            </TabsList>

            <TabsContent value="server-settings" className="space-y-4">
                <div className="mb-8">
                    <h2 className="mb-2 text-xl font-semibold">Server Settings</h2>
                    <div className="pt-4">
                        <DynamicForm
                            formSchemaId="server-settings-form"
                            initialFormData={serverSettings}
                            maxWidth="600px"
                        />
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="circles" className="space-y-4">
                <div className="mb-8">
                    <h2 className="mb-2 text-xl font-semibold">Manage Circles</h2>
                    <CirclesTab />
                </div>
            </TabsContent>

            <TabsContent value="users" className="space-y-4">
                <div className="mb-8">
                    <h2 className="mb-2 text-xl font-semibold">Manage Users</h2>
                    <UsersTab />
                </div>
            </TabsContent>

            <TabsContent value="projects" className="space-y-4">
                <div className="mb-8">
                    <h2 className="mb-2 text-xl font-semibold">Manage Projects</h2>
                    <ProjectsTab />
                </div>
            </TabsContent>

            <TabsContent value="super-admins" className="space-y-4">
                <div className="mb-8">
                    <h2 className="mb-2 text-xl font-semibold">Manage Super Admins</h2>
                    <SuperAdminsTab />
                </div>
            </TabsContent>
        </Tabs>
    );
}
