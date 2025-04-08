import React from "react";
import { getCircleByHandle } from "@/lib/data/circle";
import { notFound } from "next/navigation";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { Members } from "@/lib/data/db"; // Import Members collection

// TODO: Add error handling and loading states

export default async function CircleHomeLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: { handle: string };
}) {
    const { handle } = params;
    const userDid = await getAuthenticatedUserDid(); // Get authenticated user's DID

    // Fetch circle data - needed for context and potentially for child components
    const circle = await getCircleByHandle(handle);
    if (!circle) {
        notFound(); // Or redirect to a specific error page
    }

    // Check membership status - needed for conditional rendering in page.tsx
    const membership = userDid ? await Members.findOne({ userDid: userDid, circleId: circle._id.toString() }) : null;
    const isMember = !!membership; // True if membership document exists

    // Pass circle and membership status down via context or props if needed,
    // or fetch again in page.tsx if preferred.
    // For simplicity now, page.tsx will re-fetch or use server actions.

    return (
        <div>
            {/* Layout specific elements can go here if needed */}
            {children}
        </div>
    );
}
