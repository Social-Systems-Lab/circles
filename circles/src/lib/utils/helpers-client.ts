export const updateQueryParam = (router: any, param: string, value: string) => {
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set(param, value);
    router.push(`?${searchParams.toString()}`);
};

export const generateHandle = (title: string): string => {
    // Normalize title: lowercase, remove special chars, replace spaces with hyphens
    let handle = title
        .toLowerCase()
        .replace(/[^\w\s-]/g, "") // Remove special characters
        .replace(/\s+/g, "-") // Replace spaces with hyphens
        .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
        .trim();

    // Add random string at the end to ensure uniqueness
    const randomStr = Math.random().toString(36).substring(2, 8);
    handle = `${handle}-${randomStr}`;

    // Ensure handle is not too long (max 20 chars)
    if (handle.length > 20) {
        // Take first 12 chars of the title part and 7 chars of the random part
        handle = `${handle.substring(0, 12)}-${randomStr.substring(0, 7)}`;
    }

    return handle;
};
