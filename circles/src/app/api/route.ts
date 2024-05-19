import { NextResponse } from "next/server";
import { z } from "zod";

export async function GET() {
    return NextResponse.json([{ message: "Hello, World!" }]);
}
