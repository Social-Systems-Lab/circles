import { NextRequest, NextResponse } from "next/server";
import { getCirclesBySearchQuery } from "@/lib/data/circle";
import { Circle } from "@/models/models";

export async function GET(req: NextRequest): Promise<NextResponse<Circle[]>> {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "";
    const limit = Number(searchParams.get("limit") ?? "10");
    if (!q || q.trim().length === 0) {
      return NextResponse.json([]);
    }
    const circles = await getCirclesBySearchQuery(q.trim(), Math.min(Math.max(limit, 1), 25));
    return NextResponse.json(circles);
  } catch (error) {
    console.error("GET /api/circles/search failed:", error);
    return NextResponse.json([]);
  }
}
