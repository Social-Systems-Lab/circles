/**
 * Convert Matrix mxc:// URL to HTTP URL for display
 */
export function convertMxcToHttp(mxcUrl: string | undefined): string | undefined {
    if (!mxcUrl) return undefined;
    
    // If it's already an HTTP URL pointing to Synapse directly, convert to localhost
    if (mxcUrl.includes('127.0.0.1:8008') || mxcUrl.includes('localhost:8008')) {
        const httpUrl = mxcUrl.replace('http://127.0.0.1:8008', 'http://localhost')
                              .replace('http://localhost:8008', 'http://localhost');
        return httpUrl;
    }
    
    if (!mxcUrl.startsWith("mxc://")) {
        return mxcUrl; // Already an HTTP URL (not Synapse)
    }
    
    // Use localhost (nginx) instead of direct Synapse connection to benefit from direct file serving
    const matrixUrl = "http://localhost";
    const httpUrl = `${matrixUrl}/_matrix/media/v3/download/${mxcUrl.replace("mxc://", "")}`;
    return httpUrl;
}
