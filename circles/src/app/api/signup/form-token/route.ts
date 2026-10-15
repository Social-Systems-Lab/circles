import { NextResponse } from "next/server";
import { issueSignupFormToken } from "@/lib/auth/signup-security";

export async function GET() {
    return NextResponse.json({ token: issueSignupFormToken() }, { headers: { "Cache-Control": "no-store" } });
}
