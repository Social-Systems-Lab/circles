import type { Circle, Metrics, SortingOptions, WithMetric } from "@/models/models";

type PublicMapMetricBuilder = (
    user: Circle | undefined,
    circle: Circle,
    currentDate: Date,
    sort?: SortingOptions,
) => Promise<Metrics>;

export const applyPublicMapMetricsAndSort = async (
    circles: WithMetric<Circle>[],
    user: Circle | undefined,
    currentDate: Date,
    buildMetrics: PublicMapMetricBuilder,
    sort?: SortingOptions,
) => {
    for (const circle of circles) {
        const metricInput =
            circle.location?.precision === 4
                ? circle
                : {
                      ...circle,
                      location: circle.location ? { ...circle.location, lngLat: undefined } : undefined,
                  };
        circle.metrics = await buildMetrics(user, metricInput, currentDate, sort);
    }

    circles.sort((a, b) => (a.metrics?.rank ?? 0) - (b.metrics?.rank ?? 0));
    return circles;
};
