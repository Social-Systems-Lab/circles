import { NextResponse } from "next/server";
import { z } from "zod";

const circleSchema = z.object({
    name: z.string(),
    picture: z.string(),
    cover: z.string(),
});

export async function GET() {
    return NextResponse.json([{ message: "Hello, World!" }]);
}
