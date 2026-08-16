import "server-only";
import { unstable_cache } from "next/cache";
import { Circles } from "./db";
import { getDiscoverableLifecycleQuery, getPublishedCircleQuery } from "./circle";
import { circleVisibilityMongoQuery } from "./circle-visibility-policy";
import { getPublicCircleCountQuery } from "./platform-stats-query";

export type PublicPlatformStats = {
    people: number;
    circles: number;
};

const getCachedPublicPlatformStats = unstable_cache(
    async (): Promise<PublicPlatformStats> => {
        const publishedQuery = getPublishedCircleQuery();

        const [people, circles] = await Promise.all([
            Circles.countDocuments({
                $and: [
                    { circleType: "user" },
                    publishedQuery,
                    getDiscoverableLifecycleQuery(),
                    circleVisibilityMongoQuery({}),
                    {
                        $or: [{ isVerified: true }, { isMember: true }],
                    },
                ],
            }),
            Circles.countDocuments(getPublicCircleCountQuery()),
        ]);

        return { people, circles };
    },
    ["public-platform-stats"],
    { revalidate: 3600 },
);

export async function getPublicPlatformStats(): Promise<PublicPlatformStats> {
    return getCachedPublicPlatformStats();
}
