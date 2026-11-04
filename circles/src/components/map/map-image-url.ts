export const getOptimizedImageUrl = (
    imageUrl: string | undefined,
    width: number,
    quality = 70,
): string | undefined => {
    if (
        !imageUrl ||
        imageUrl.startsWith("data:") ||
        imageUrl.startsWith("blob:") ||
        imageUrl.startsWith("/_next/image") ||
        imageUrl.startsWith("/private-media/")
    ) {
        return imageUrl;
    }

    return `/_next/image?url=${encodeURIComponent(imageUrl)}&w=${width}&q=${quality}`;
};
