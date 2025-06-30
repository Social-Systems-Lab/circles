"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GlobalServerSettingsForm } from "./global-server-settings-form"; // Import the new form
import { Circle, ServerSettings } from "@/models/models";
import { Button } from "@/components/ui/button"; // Import Button
import { triggerReindexAction, syncAllDonorboxSubscriptions } from "./actions"; // Import the new action
import CirclesTab from "./tabs/circles-tab";
import UsersTab from "./tabs/users-tab";
import SuperAdminsTab from "./tabs/super-admins-tab";
import VerificationRequestsTab from "./tabs/verification-requests-tab";
import { toast } from "sonner"; // Import toast for feedback

interface AdminDashboardProps {
    serverSettings: ServerSettings;
    circles: Circle[];
}

export default function AdminDashboard({ serverSettings, circles }: AdminDashboardProps) {
    const [activeTab, setActiveTab] = useState("server-settings");
    const [isReindexing, setIsReindexing] = useState(false);
    const [reindexStatusMessage, setReindexStatusMessage] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);

    const handleSyncClick = async () => {
        setIsSyncing(true);
        setSyncStatusMessage("Starting Donorbox sync process...");
        toast.info("Starting Donorbox sync process...");

        try {
            const result = await syncAllDonorboxSubscriptions();
            setSyncStatusMessage(result.message);
            if (result.success) {
                toast.success(result.message);
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "An unexpected error occurred.";
            setSyncStatusMessage(`Error: ${message}`);
            toast.error(`Error: ${message}`);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleReindexClick = async () => {
        setIsReindexing(true);
        setReindexStatusMessage("Starting re-indexing process...");
        toast.info("Starting re-indexing process..."); // Toast notification

        try {
            const result = await triggerReindexAction();
            setReindexStatusMessage(result.message);
            if (result.success) {
                toast.success(result.message);
            } else {
                toast.error(result.message);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "An unexpected error occurred.";
            setReindexStatusMessage(`Error: ${message}`);
            toast.error(`Error: ${message}`);
        } finally {
            setIsReindexing(false);
        }
    };

    return (
        <Tabs defaultValue="server-settings" className="w-full" onValueChange={setActiveTab}>
            <TabsList className="mb-6">
                <TabsTrigger value="server-settings">Server Settings</TabsTrigger>
                <TabsTrigger value="operations">Server Operations</TabsTrigger> {/* New Tab Trigger */}
                <TabsTrigger value="circles">Circles</TabsTrigger>
                <TabsTrigger value="users">Users</TabsTrigger>
                <TabsTrigger value="verification-requests">Verification Requests</TabsTrigger>
                <TabsTrigger value="super-admins">Super Admins</TabsTrigger>
            </TabsList>

            <TabsContent value="server-settings" className="space-y-4">
                <div className="mb-8">
                    <h2 className="mb-2 text-xl font-semibold">Server Settings</h2>
                    <div className="pt-4">
                        <GlobalServerSettingsForm serverSettings={serverSettings} maxWidth="600px" />
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

            <TabsContent value="verification-requests" className="space-y-4">
                <div className="mb-8">
                    <h2 className="mb-2 text-xl font-semibold">Verification Requests</h2>
                    <VerificationRequestsTab />
                </div>
            </TabsContent>

            <TabsContent value="super-admins" className="space-y-4">
                <div className="mb-8">
                    <h2 className="mb-2 text-xl font-semibold">Manage Super Admins</h2>
                    <SuperAdminsTab />
                </div>
            </TabsContent>

            {/* New Tab Content for Server Operations */}
            <TabsContent value="operations" className="space-y-4">
                <div className="mb-8">
                    <h2 className="mb-2 text-xl font-semibold">Server Operations</h2>
                    <div className="space-y-4 pt-4">
                        <div>
                            <h3 className="mb-2 text-lg font-medium">Vector Database Re-indexing</h3>
                            <p className="mb-3 text-sm text-muted-foreground">
                                This operation will re-calculate and update embeddings for all circles and posts in the
                                vector database. This can take some time depending on the amount of content.
                            </p>
                            <Button onClick={handleReindexClick} disabled={isReindexing}>
                                {isReindexing ? "Re-indexing..." : "Re-index All Embeddings"}
                            </Button>
                            {reindexStatusMessage && (
                                <p
                                    className={`mt-2 text-sm ${
                                        reindexStatusMessage.startsWith("Error:") ? "text-red-600" : "text-green-600"
                                    }`}
                                >
                                    {reindexStatusMessage}
                                </p>
                            )}
                        </div>
                        <div className="border-t pt-4">
                            <h3 className="mb-2 text-lg font-medium">Sync Donorbox Subscriptions</h3>
                            <p className="mb-3 text-sm text-muted-foreground">
                                This operation will fetch all donors from Donorbox and update the subscription status
                                for all users in the database. This can take some time.
                            </p>
                            <Button onClick={handleSyncClick} disabled={isSyncing}>
                                {isSyncing ? "Syncing..." : "Sync All Donorbox Subscriptions"}
                            </Button>
                            {syncStatusMessage && (
                                <p
                                    className={`mt-2 text-sm ${
                                        syncStatusMessage.startsWith("Error:") ? "text-red-600" : "text-green-600"
                                    }`}
                                >
                                    {syncStatusMessage}
                                </p>
                            )}
                        </div>
                        {/* Add other server operations here in the future */}
                    </div>
                </div>
            </TabsContent>
        </Tabs>
    );
}
