import { NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user";
import { getCirclesByIds } from "@/lib/data/circle";
import { Circle } from "@/models/models";

export async function GET(): Promise<NextResponse<Circle[]>> {
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

    const circles = await getCirclesByIds(ids);
    return NextResponse.json(circles);
  } catch (error) {
    console.error("Failed to fetch bookmarked circles via API:", error);
    // Return empty array on error to keep UI resilient
    return NextResponse.json([]);
  }
}
