import Link from "next/link";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user";
import { getCirclesByIds } from "@/lib/data/circle";
import { Circle, UserPrivate } from "@/models/models";
import BookmarkCard from "./bookmark-card";

export default async function BookmarksPage() {
  const userDid = await getAuthenticatedUserDid();

  if (!userDid) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="mb-2 text-2xl font-bold">Bookmarks</h1>
        <p className="text-gray-600">You need to be logged in to view your bookmarked communities.</p>
        <div className="mt-4">
          <Link href="/welcome" className="text-blue-600 hover:underline">
            Go to Welcome
          </Link>
        </div>
      </div>
    );
  }

  const user = (await getUserPrivate(userDid)) as UserPrivate;

  const bookmarkedIds: string[] = user.bookmarkedCircles ?? [];
  const pinnedIds: string[] = user.pinnedCircles ?? [];

  // Resolve pinned circles preserving order
  let pinned: Circle[] = [];
  if (pinnedIds.length > 0) {
    pinned = await getCirclesByIds(pinnedIds);
    const byId = new Map(pinned.map((c) => [c._id?.toString(), c]));
    pinned = pinnedIds.map((id) => byId.get(id)).filter((c): c is Circle => !!c);
  }

  // Resolve remaining bookmarks (not pinned), any order
  const remainingIds = bookmarkedIds.filter((id) => !pinnedIds.includes(id));
  let remaining: Circle[] = [];
  if (remainingIds.length > 0) {
    remaining = await getCirclesByIds(remainingIds);
  }

  const hasAny = pinned.length > 0 || remaining.length > 0;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-2xl font-bold">Bookmarks</h1>
      <p className="mb-4 text-sm text-gray-600">Pinned communities appear first and also count as bookmarks.</p>

      {!hasAny ? (
        <div className="rounded-md border bg-white p-6 text-center text-gray-600">
          No bookmarks yet. Visit a community and click the Bookmark button to add it here.
          <div className="mt-3">
            <Link href="/explore" className="text-blue-600 hover:underline">
              Explore communities
            </Link>
          </div>
        </div>
      ) : (
        <>
          {pinned.length > 0 && (
            <>
              <h2 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Pinned</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {pinned.map((c) => (
                  <BookmarkCard key={`p-${c._id}`} circle={c} pinned />
                ))}
              </div>
            </>
          )}

          {remaining.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">All bookmarks</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {remaining.map((c) => (
                  <BookmarkCard key={`b-${c._id}`} circle={c} pinned={false} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
