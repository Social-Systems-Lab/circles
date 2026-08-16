import { getDiscoverableLifecycleQuery } from "./circle-lifecycle-policy";
import { circleVisibilityMongoQuery } from "./circle-visibility-policy";
import { getPublishedCircleQuery } from "./circle-discovery-queries";
import type { Circle } from "@/models/models";
import type { Filter } from "mongodb";

export const getPublicCircleCountQuery = (): Filter<Circle> => ({
    $and: [
        { circleType: { $in: ["circle", "project"] } },
        getPublishedCircleQuery(),
        getDiscoverableLifecycleQuery(),
        circleVisibilityMongoQuery({}),
    ],
});
