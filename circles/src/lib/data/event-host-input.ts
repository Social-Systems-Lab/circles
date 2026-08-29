export const uniqueEventHostIds = (values: unknown[]) =>
    Array.from(
        new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)),
    );

/** Preserves malformed host input so the canonical host policy can deny it neutrally. */
export function parseEventHostCircleIds(formData: FormData, primaryCircleId: string): string[] {
    const parsedValues = formData.getAll("hostCircleIds").flatMap((value) => {
        if (typeof value !== "string") return ["__invalid_event_host_structure__"];
        if (value.trim().length === 0) return [];
        try {
            const parsed: unknown = JSON.parse(value);
            if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
                return ["__invalid_event_host_structure__"];
            }
            return parsed.some((entry) => entry.trim().length === 0) ? ["__invalid_event_host_structure__"] : parsed;
        } catch {
            return [value];
        }
    });
    return uniqueEventHostIds([primaryCircleId, ...parsedValues]);
}
