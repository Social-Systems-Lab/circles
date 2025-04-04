"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Circle, MembershipRequest } from "@/models/models"; // Removed Page import
import MembershipRequestsTable from "./membership-requests-table";
import RejectedRequestsTable from "./rejected-requests-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsCompact } from "@/components/utils/use-is-compact";

interface MembershipGatewayProps {
    circle: Circle;
    pendingRequests: MembershipRequest[];
    rejectedRequests: MembershipRequest[];
}

const MembershipGateway: React.FC<MembershipGatewayProps> = ({ circle, pendingRequests, rejectedRequests }) => {
    // Commented out page destructuring
    const isCompact = useIsCompact();

    return (
        <div
            className="flex h-full flex-1 items-start justify-center"
            style={{
                flexGrow: isCompact ? "1" : "3",
                maxWidth: isCompact ? "none" : "1000px",
            }}
        >
            <div className="flex flex-1 flex-row items-center justify-center pb-8 pl-6 pr-6">
                <div className="flex flex-1 flex-col">
                    <h1 className="m-0 p-0 pb-3 text-3xl font-bold">Follow Requests</h1>
                    <p className=" pb-8 text-gray-500">Manage and control incoming follow requests.</p>
                    <Tabs defaultValue="pending" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="pending">Pending Requests</TabsTrigger>
                            <TabsTrigger value="rejected">Rejected Requests</TabsTrigger>
                        </TabsList>
                        <TabsContent value="pending">
                            {/* Removed page prop from MembershipRequestsTable */}
                            <MembershipRequestsTable circle={circle} requests={pendingRequests} />
                        </TabsContent>
                        <TabsContent value="rejected">
                            {/* Removed page prop from RejectedRequestsTable */}
                            <RejectedRequestsTable circle={circle} requests={rejectedRequests} />
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        </div>
    );
};

export default MembershipGateway;
