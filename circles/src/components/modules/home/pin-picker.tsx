"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Circle } from "@/models/models";
import { CirclePicture } from "../circles/circle-picture";
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type PinPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (circle: Circle) => void;
  className?: string;
};

const PinPicker: React.FC<PinPickerProps> = ({ open, onOpenChange, onSelect, className }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(false);

  // simple debounce
  useEffect(() => {
    if (!open) return;
    let active = true;
    const handler = setTimeout(async () => {
      try {
        setLoading(true);
        const url =
          query.trim().length > 0
            ? `/api/circles/search?q=${encodeURIComponent(query.trim())}&limit=20`
            : `/api/circles/search?q=${encodeURIComponent("")}&limit=0`; // return []
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to search");
        const circles = (await res.json()) as Circle[];
        if (active) setResults(circles);
      } catch (e) {
        if (active) setResults([]);
        // swallow
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(handler);
    };
  }, [query, open]);

  const emptyState = useMemo(
    () => query.trim().length === 0 && results.length === 0 && !loading,
    [query, results, loading]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-lg", className)}>
        <DialogHeader>
          <DialogTitle>Pin a community</DialogTitle>
          <DialogDescription>
            Search and select a community to pin. Pinned communities appear first and are limited to 5 slots.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative w-full">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search communities..."
              className="pl-8"
            />
          </div>
        </div>

        <div className="mt-3 max-h-80 overflow-auto rounded-md border">
          {loading && (
            <div className="flex items-center justify-center p-6 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Searching...
            </div>
          )}
          {emptyState && (
            <div className="p-6 text-center text-sm text-gray-500">
              Start typing to search communities to pin.
            </div>
          )}
          {!loading && results.length > 0 && (
            <ul className="divide-y">
              {results.map((c) => (
                <li
                  key={c._id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50"
                  onClick={() => {
                    onSelect(c);
                    onOpenChange(false);
                  }}
                >
                  <CirclePicture circle={c} size="28px" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="truncate text-xs text-gray-500">@{c.handle}</div>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 px-2">
                    Pin
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PinPicker;
