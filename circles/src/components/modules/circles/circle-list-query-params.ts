export type CircleInventoryFilters = {
    includeCreated: boolean;
    includeMember: boolean;
};

export const parseCircleInventoryFilters = (
    searchParams?: Record<string, string | string[] | undefined>,
): CircleInventoryFilters => ({
    includeCreated: searchParams?.includeCreated !== "false",
    includeMember: searchParams?.includeMember !== "false",
});

export const buildCircleInventoryFilterUrl = (currentSearch: string, filters: CircleInventoryFilters): string => {
    const searchParams = new URLSearchParams(currentSearch);
    searchParams.set("includeCreated", String(filters.includeCreated));
    searchParams.set("includeMember", String(filters.includeMember));
    return `?${searchParams.toString()}`;
};

export const shouldReplaceCircleInventoryFilters = (
    current: CircleInventoryFilters,
    initial: CircleInventoryFilters,
): boolean => current.includeCreated !== initial.includeCreated || current.includeMember !== initial.includeMember;
