import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user";
import { getCirclesByIds } from "@/lib/data/circle";
import { pinCircle, unpinCircle } from "@/lib/data/user";
import { Circle, UserPrivate } from "@/models/models";

/**
 * GET /api/pins
 * Returns pinned circles in pinned order for the authenticated user.
 */
export async function GET(): Promise<NextResponse<Circle[]>> {
  try {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
      return NextResponse.json([]);
    }

    const user = (await getUserPrivate(userDid)) as UserPrivate;
    const ids = user.pinnedCircles ?? [];
    if (!ids || ids.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch circle docs and preserve order of pinned ids
    const circles = await getCirclesByIds(ids);
    const byId = new Map(circles.map((c) => [c._id?.toString(), c]));
    const ordered = ids.map((id) => byId.get(id)).filter((c): c is Circle => !!c);
    return NextResponse.json(ordered);
  } catch (error) {
    console.error("GET /api/pins failed:", error);
    return NextResponse.json([]);
  }
}

/**
 * POST /api/pins
 * Body: { circleId: string }
 * Pins the circle (adds to front, max 5) and ensures it's bookmarked.
 * Returns { user: UserPrivate }
 */
export async function POST(req: NextRequest): Promise<NextResponse<{ user?: UserPrivate; error?: string }>> {
  try {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { circleId } = (await req.json()) as { circleId?: string };
    if (!circleId) {
      return NextResponse.json({ error: "circleId required" }, { status: 400 });
    }

    await pinCircle(userDid, circleId);
    const user = (await getUserPrivate(userDid)) as UserPrivate;
    return NextResponse.json({ user });
  } catch (error) {
    console.error("POST /api/pins failed:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

/**
 * DELETE /api/pins?circleId=...
 * Unpins the circle.
 * Returns { user: UserPrivate }
 */
export async function DELETE(req: NextRequest): Promise<NextResponse<{ user?: UserPrivate; error?: string }>> {
  try {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const circleId = searchParams.get("circleId");
    if (!circleId) {
      return NextResponse.json({ error: "circleId required" }, { status: 400 });
    }

    await unpinCircle(userDid, circleId);
    const user = (await getUserPrivate(userDid)) as UserPrivate;
    return NextResponse.json({ user });
  } catch (error) {
    console.error("DELETE /api/pins failed:", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
