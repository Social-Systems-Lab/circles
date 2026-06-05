import { NextRequest, NextResponse } from "next/server";
import { Client as MinioClient } from "minio";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;

  // (keep your existing production guard if you want it)

  const host = process.env.MINIO_HOST || "127.0.0.1";
  const port = parseInt(process.env.MINIO_PORT || "9000", 10);
  const accessKey = process.env.MINIO_ROOT_USERNAME || "minioadmin";
  const secretKey = process.env.MINIO_ROOT_PASSWORD || "minioadmin";
  const bucket = process.env.MINIO_BUCKET || "circles";

  const objectName = (path || []).join("/");
  if (!objectName) {
    return NextResponse.json({ error: "Missing object path" }, { status: 400 });
  }

  const client = new MinioClient({
    endPoint: host,
    port,
    useSSL: false,
    accessKey,
    secretKey,
  });

  try {
    const stream = await client.getObject(bucket, objectName);

    const lower = objectName.toLowerCase();
    const contentType =
      lower.endsWith(".png") ? "image/png" :
      lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "image/jpeg" :
      lower.endsWith(".webp") ? "image/webp" :
      lower.endsWith(".gif") ? "image/gif" :
      lower.endsWith(".svg") ? "image/svg+xml" :
      "application/octet-stream";

    return new NextResponse(stream as any, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("[storage proxy] failed", { bucket, objectName, host, port, err });
    return NextResponse.json({ error: "Storage fetch failed" }, { status: 502 });
  }
}