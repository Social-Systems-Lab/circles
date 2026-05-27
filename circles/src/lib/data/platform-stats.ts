import "server-only";
import { unstable_cache } from "next/cache";
import { Circles } from "./db";
import { getPublishedCircleQuery } from "./circle";

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
                    {
                        $or: [{ isVerified: true }, { isMember: true }],
                    },
                ],
            }),
            Circles.countDocuments({
                $and: [{ circleType: { $in: ["circle", "project"] } }, publishedQuery],
            }),
        ]);

        return { people, circles };
    },
    ["public-platform-stats"],
    { revalidate: 3600 },
);

export async function getPublicPlatformStats(): Promise<PublicPlatformStats> {
    return getCachedPublicPlatformStats();
}
