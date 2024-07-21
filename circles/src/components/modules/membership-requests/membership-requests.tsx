"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Circle, MembershipRequest, Page } from "@/models/models";
import MembershipRequestsTable from "./membership-requests-table";
import RejectedRequestsTable from "./rejected-requests-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MembershipGatewayProps {
    circle: Circle;
    page: Page;
    pendingRequests: MembershipRequest[];
    rejectedRequests: MembershipRequest[];
}

const MembershipGateway: React.FC<MembershipGatewayProps> = ({ circle, page, pendingRequests, rejectedRequests }) => {
    return (
        <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pending">Pending Requests</TabsTrigger>
                <TabsTrigger value="rejected">Rejected Requests</TabsTrigger>
            </TabsList>
            <TabsContent value="pending">
                <MembershipRequestsTable circle={circle} page={page} requests={pendingRequests} />
            </TabsContent>
            <TabsContent value="rejected">
                <RejectedRequestsTable circle={circle} page={page} requests={rejectedRequests} />
            </TabsContent>
        </Tabs>
    );
};

export default MembershipGateway;
