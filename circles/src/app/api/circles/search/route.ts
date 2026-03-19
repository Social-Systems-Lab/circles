import { NextRequest, NextResponse } from "next/server";
import { searchDiscoverableCircles } from "@/lib/data/search";
import { CircleType } from "@/models/models";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const q = searchParams.get("q") ?? "";
        const limit = Number(searchParams.get("limit") ?? "10");
        const type = searchParams.get("type") as CircleType | null;

        if (!q || q.trim().length === 0) {
            return NextResponse.json({ circles: [] });
        }

        const circles = await searchDiscoverableCircles({
            query: q.trim(),
            limit: Math.min(Math.max(limit, 1), 25),
            circleTypes: type ? [type] : undefined,
        });

        return NextResponse.json({ circles });
    } catch (error) {
        console.error("GET /api/circles/search failed:", error);
        return NextResponse.json({ circles: [] }, { status: 500 });
    }
}
