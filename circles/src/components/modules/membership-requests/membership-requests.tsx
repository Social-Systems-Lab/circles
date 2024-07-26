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
        <div className="flex flex-1 flex-row items-center justify-center pb-8 pl-6 pr-6">
            <div className="flex flex-1 flex-col">
                <h1 className="m-0 p-0 pb-3 text-3xl font-bold">Membership Requests</h1>
                <p className=" pb-8 text-gray-500">
                    Manage and control the requests for membership within the circle. Review, approve, or reject
                    membership applications to ensure appropriate access for new members. Members will be automatically
                    approved for public circles.
                </p>
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
            </div>
        </div>
    );
};

export default MembershipGateway;
