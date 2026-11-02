import { NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user";
import { getDiscoverableCirclesByIds } from "@/lib/data/circle";
import type { ClientCircleDto } from "@/lib/data/client-circle-dto";
import { buildPinnedCircleDto } from "@/lib/data/client-circle-dto";

export async function GET(): Promise<NextResponse<ClientCircleDto[]>> {
    try {
        const userDid = await getAuthenticatedUserDid();
        if (!userDid) {
            return NextResponse.json([]);
        }

        const user = await getUserPrivate(userDid);
        const ids = user.bookmarkedCircles ?? [];
        if (!ids || ids.length === 0) {
            return NextResponse.json([]);
        }

        const circles = await getDiscoverableCirclesByIds(ids, userDid);
        return NextResponse.json(circles.map(buildPinnedCircleDto));
    } catch (error) {
        console.error("Failed to fetch bookmarked circles via API:", error);
        // Return empty array on error to keep UI resilient
        return NextResponse.json([]);
    }
}
