"use client";

import React, { useState, useTransition } from "react";
import { Circle, UserPrivate } from "@/models/models";
import { Button } from "@/components/ui/button";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { useAtom } from "jotai";
import { userAtom } from "@/lib/data/atoms";
import { useToast } from "@/components/ui/use-toast";
import { toggleBookmarkAction } from "./actions";

type BookmarkButtonProps = {
  circle: Circle;
  renderCompact?: boolean;
  className?: string;
  iconOnly?: boolean;
};

export const BookmarkButton: React.FC<BookmarkButtonProps> = ({ circle, renderCompact, className, iconOnly }) => {
  const [user, setUser] = useAtom(userAtom);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const circleId = circle?._id?.toString();
  const isBookmarked =
    !!user && !!circleId && Array.isArray((user as UserPrivate).bookmarkedCircles)
      ? (user as UserPrivate).bookmarkedCircles!.includes(circleId)
      : false;

  const onToggleBookmark = () => {
    if (!user || !circleId) {
      toast({
        title: "Sign in required",
        description: "You need to be logged in to bookmark a community.",
        variant: "destructive",
      });
      return;
    }

    const prevUser = user;
    // Optimistic update
    const nextList = new Set<string>(prevUser.bookmarkedCircles ?? []);
    if (isBookmarked) {
      nextList.delete(circleId);
    } else {
      nextList.add(circleId);
    }
    setUser({ ...(prevUser as UserPrivate), bookmarkedCircles: Array.from(nextList) });

    setIsLoading(true);
    startTransition(async () => {
      try {
        const updated = await toggleBookmarkAction(circleId);
        if (updated) {
          setUser(updated);
          toast({
            title: isBookmarked ? "Removed bookmark" : "Bookmarked",
            description: isBookmarked
              ? `Removed ${circle.name} from your bookmarks.`
              : `Added ${circle.name} to your bookmarks.`,
          });
        } else {
          // Rollback on failure
          setUser(prevUser as UserPrivate);
          toast({
            title: "Error",
            description: "Failed to update bookmark. Please try again.",
            variant: "destructive",
          });
        }
      } catch (e) {
        setUser(prevUser as UserPrivate);
        toast({
          title: "Error",
          description: "An unexpected error occurred.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    });
  };

  const size = renderCompact ? "sm" : "default";

  return (
    <Button
      variant={isBookmarked ? "outline" : "default"}
      size={size as any}
      onClick={onToggleBookmark}
      disabled={isLoading || isPending}
      className={className}
      aria-pressed={isBookmarked}
      title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
    >
      {isLoading || isPending ? (
        <Loader2 className={iconOnly ? "h-4 w-4 animate-spin" : "mr-2 h-4 w-4 animate-spin"} />
      ) : isBookmarked ? (
        <BookmarkCheck className={iconOnly ? "h-4 w-4" : "mr-2 h-4 w-4"} />
      ) : (
        <Bookmark className={iconOnly ? "h-4 w-4" : "mr-2 h-4 w-4"} />
      )}
      {!iconOnly && (isBookmarked ? "Bookmarked" : "Bookmark")}
    </Button>
  );
};

export default BookmarkButton;
