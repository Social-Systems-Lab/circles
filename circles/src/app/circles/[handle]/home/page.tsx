import React from "react";
import { notFound } from "next/navigation";
import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid } from "@/lib/auth/auth"; // Keep for potential future use, but not needed now
// import { Members } from "@/lib/data/db"; // No longer needed for membership check here
import AboutPage from "@/components/modules/home/AboutPage";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // No longer needed

// TODO: Add error handling and loading states more robustly

export default async function CircleHomePage({ params }: { params: { handle: string } }) {
    const { handle } = params;
    // const userDid = await getAuthenticatedUserDid(); // Not needed for this simplified version

    // Fetch circle data
    const circle = await getCircleByHandle(handle);
    if (!circle) {
        notFound();
    }

    // No longer checking membership status here, always show About page
    // const membership = userDid ? await Members.findOne({ userDid: userDid, circleId: circle._id.toString() }) : null;
    // const isMember = !!membership;

    // Always render the AboutPage, passing the fetched circle data
    return <AboutPage circle={circle} />;
}
