export const updateQueryParam = (router: any, param: string, value: string) => {
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.set(param, value);
    router.push(`?${searchParams.toString()}`);
};
