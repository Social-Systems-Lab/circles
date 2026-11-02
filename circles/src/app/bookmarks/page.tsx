import Link from "next/link";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getUserPrivate } from "@/lib/data/user";
import { getDiscoverableCirclesByIds } from "@/lib/data/circle";
import type { Circle, UserPrivate } from "@/models/models";
import BookmarkCard from "./bookmark-card";
import { buildPinnedCircleDto, type ClientCircleDto } from "@/lib/data/client-circle-dto";

export default async function BookmarksPage() {
    const userDid = await getAuthenticatedUserDid();

    if (!userDid) {
        return (
            <div className="mx-auto max-w-5xl p-6">
                <h1 className="mb-2 text-2xl font-bold">Bookmarks</h1>
                <p className="text-gray-600">You need to be logged in to view your saved profiles.</p>
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
    let pinned: ClientCircleDto[] = [];
    if (pinnedIds.length > 0) {
        const rawPinned = await getDiscoverableCirclesByIds(pinnedIds, userDid);
        const byId = new Map(rawPinned.map((circle) => [circle._id?.toString(), circle]));
        pinned = pinnedIds
            .map((id) => byId.get(id))
            .filter((circle): circle is Circle => !!circle)
            .map(buildPinnedCircleDto);
    }

    // Resolve remaining bookmarks (not pinned), any order
    const remainingIds = bookmarkedIds.filter((id) => !pinnedIds.includes(id));
    let remaining: ClientCircleDto[] = [];
    if (remainingIds.length > 0) {
        remaining = (await getDiscoverableCirclesByIds(remainingIds, userDid)).map(buildPinnedCircleDto);
    }

    const hasAny = pinned.length > 0 || remaining.length > 0;

    return (
        <div className="mx-auto max-w-5xl p-6">
            <h1 className="mb-1 text-2xl font-bold">Bookmarks</h1>
            <p className="mb-4 text-sm text-gray-600">Pinned profiles appear first and also count as saved profiles.</p>

            {!hasAny ? (
                <div className="rounded-md border bg-white p-6 text-center text-gray-600">
                    No saved profiles yet. Visit an artist, host, or community profile and click Bookmark to add it
                    here.
                    <div className="mt-3">
                        <Link href="/explore" className="text-blue-600 hover:underline">
                            Explore Kamooni
                        </Link>
                    </div>
                </div>
            ) : (
                <>
                    {pinned.length > 0 && (
                        <>
                            <h2 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                                Pinned
                            </h2>
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                                {pinned.map((c) => (
                                    <BookmarkCard key={`p-${c._id}`} circle={c} pinned />
                                ))}
                            </div>
                        </>
                    )}

                    {remaining.length > 0 && (
                        <>
                            <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">
                                All saved profiles
                            </h2>
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
