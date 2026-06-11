import { NextRequest, NextResponse } from "next/server";
import { Client as MinioClient } from "minio";

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;

  // (keep your existing production guard if you want it)
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

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
    const buffer = await streamToBuffer(stream);

    const lower = objectName.toLowerCase();
    const contentType =
      lower.endsWith(".png") ? "image/png" :
      lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "image/jpeg" :
      lower.endsWith(".webp") ? "image/webp" :
      lower.endsWith(".gif") ? "image/gif" :
      lower.endsWith(".svg") ? "image/svg+xml" :
      "application/octet-stream";

    return new NextResponse(buffer, {
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