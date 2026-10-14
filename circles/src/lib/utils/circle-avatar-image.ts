export const shouldUnoptimizeCircleAvatar = (src?: string | null): boolean =>
    typeof src === "string" && src.startsWith("/private-media/");
