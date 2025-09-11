import { NextRequest, NextResponse } from "next/server";
import { getCirclesBySearchQuery } from "@/lib/data/circle";
import { Circle, CircleType } from "@/models/models";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const q = searchParams.get("q") ?? "";
        const limit = Number(searchParams.get("limit") ?? "10");
        const type = searchParams.get("type") as CircleType | null;

        if (!q || q.trim().length === 0) {
            return NextResponse.json({ circles: [] });
        }

        const circles = await getCirclesBySearchQuery(q.trim(), Math.min(Math.max(limit, 1), 25), type ?? undefined);

        return NextResponse.json({ circles });
    } catch (error) {
        console.error("GET /api/circles/search failed:", error);
        return NextResponse.json({ circles: [] }, { status: 500 });
    }
}
