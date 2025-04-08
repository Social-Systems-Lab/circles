import React from "react";
import { notFound } from "next/navigation";
import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { Members } from "@/lib/data/db";
import IntroductionPage from "@/components/modules/home/IntroductionPage";
import OverviewPage from "@/components/modules/home/OverviewPage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// TODO: Add error handling and loading states more robustly

export default async function CircleHomePage({ params }: { params: { handle: string } }) {
    const { handle } = params;
    const userDid = await getAuthenticatedUserDid();

    // Fetch circle data
    const circle = await getCircleByHandle(handle);
    if (!circle) {
        notFound();
    }

    // Check membership status
    const membership = userDid ? await Members.findOne({ userDid: userDid, circleId: circle._id.toString() }) : null;
    const isMember = !!membership;

    if (!isMember) {
        // Non-members only see the Introduction page
        return <IntroductionPage />;
    } else {
        // Members see Introduction and Overview tabs
        return (
            <Tabs defaultValue="introduction" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="introduction">Introduction</TabsTrigger>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                </TabsList>
                <TabsContent value="introduction" className="mt-4">
                    <IntroductionPage />
                </TabsContent>
                <TabsContent value="overview" className="mt-4">
                    <OverviewPage />
                </TabsContent>
            </Tabs>
        );
    }
}
