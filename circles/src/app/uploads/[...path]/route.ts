import { NextRequest, NextResponse } from "next/server";
import { Client as MinioClient } from "minio";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {

  const { path } = await context.params;

  const host = process.env.MINIO_HOST || "127.0.0.1";
  const port = parseInt(process.env.MINIO_PORT || "9000", 10);
  const accessKey = process.env.MINIO_ROOT_USERNAME || "minioadmin";
  const secretKey = process.env.MINIO_ROOT_PASSWORD || "minioadmin";
  const bucket = process.env.MINIO_BUCKET || "circles";

  const raw = (path || []).join("/");
  if (!raw) {
    return NextResponse.json({ error: "Missing object path" }, { status: 400 });
  }

  const client = new MinioClient({
    endPoint: host,
    port,
    useSSL: false,
    accessKey,
    secretKey,
  });

  const tryKeys = [raw, `uploads/${raw}`];

  try {
    let stream: any;
    let objectNameUsed = raw;

    for (const key of tryKeys) {
      try {
        stream = await client.getObject(bucket, key);
        objectNameUsed = key;
        break;
      } catch (err: any) {
        // Only fallback on missing key; anything else is a real error
        if (err?.code !== "NoSuchKey") throw err;
      }
    }

    if (!stream) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const lower = objectNameUsed.toLowerCase();
    const contentType =
      lower.endsWith(".png") ? "image/png" :
      lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "image/jpeg" :
      lower.endsWith(".webp") ? "image/webp" :
      lower.endsWith(".gif") ? "image/gif" :
      lower.endsWith(".svg") ? "image/svg+xml" :
      "application/octet-stream";

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("[uploads proxy] failed", { bucket, objectName: raw, host, port, err });
    return NextResponse.json({ error: "Storage fetch failed" }, { status: 502 });
  }
}
