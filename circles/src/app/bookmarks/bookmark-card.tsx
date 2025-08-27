"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Circle } from "@/models/models";
import { CirclePicture } from "@/components/modules/circles/circle-picture";
import { Button } from "@/components/ui/button";
import { Pin, PinOff, Loader2 } from "lucide-react";
import React, { useState } from "react";

type BookmarkCardProps = {
  circle: Circle;
  pinned: boolean;
};

export default function BookmarkCard({ circle, pinned }: BookmarkCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onPin = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ circleId: circle._id }),
      });
      // ignore response body, just refresh
    } catch {}
    setBusy(false);
    router.refresh();
  };

  const onUnpin = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/pins?circleId=${encodeURIComponent(circle._id as string)}`, {
        method: "DELETE",
      });
      // ignore response body, just refresh
    } catch {}
    setBusy(false);
    router.refresh();
  };

  return (
    <Link
      href={`/circles/${circle.handle}`}
      className="group relative flex flex-col items-center rounded-md border bg-white p-3 transition hover:shadow"
    >
      <div className="relative">
        <CirclePicture circle={circle} size="64px" openPreview />
      </div>
      <div className="mt-2 w-full truncate text-center text-sm font-medium">{circle.name}</div>
      <div className="w-full truncate text-center text-xs text-gray-500">@{circle.handle}</div>

      {/* Controls */}
      <div className="mt-2">
        {pinned ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2"
            onClick={onUnpin}
            title="Remove pin"
            aria-label="Remove pin"
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PinOff className="h-4 w-4" />}
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 px-3"
            onClick={onPin}
            title="Pin"
            aria-label="Pin"
            disabled={busy}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pin className="mr-2 h-4 w-4" />}
            Pin
          </Button>
        )}
      </div>
    </Link>
  );
}
