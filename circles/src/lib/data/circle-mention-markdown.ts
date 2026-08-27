import { ObjectId } from "mongodb";

export type CompleteMarkdownLinkOccurrence = {
    start: number;
    end: number;
    target: string;
};

export type CircleReferenceOccurrence = CompleteMarkdownLinkOccurrence & {
    identifier: string | null;
    objectId?: string;
    handle?: string;
};

export function isMarkdownDelimiterEscaped(content: string, index: number): boolean {
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && content[cursor] === "\\"; cursor -= 1) backslashes += 1;
    return backslashes % 2 === 1;
}

function findUnescapedDelimiter(content: string, delimiter: string, start: number): number {
    for (let cursor = start; cursor < content.length; cursor += 1) {
        if (content[cursor] === "\r" || content[cursor] === "\n") return -1;
        if (content[cursor] === delimiter && !isMarkdownDelimiterEscaped(content, cursor)) return cursor;
    }
    return -1;
}

export function findCompleteMarkdownLinkOccurrences(content: string): CompleteMarkdownLinkOccurrence[] {
    const occurrences: CompleteMarkdownLinkOccurrence[] = [];
    for (let start = 0; start < content.length; start += 1) {
        if (content[start] !== "[" || isMarkdownDelimiterEscaped(content, start)) continue;
        if (start > 0 && content[start - 1] === "!" && !isMarkdownDelimiterEscaped(content, start - 1)) continue;

        const labelEnd = findUnescapedDelimiter(content, "]", start + 1);
        if (labelEnd < 0 || content[labelEnd + 1] !== "(") continue;
        const destinationStart = labelEnd + 2;
        let target: string;
        let destinationEnd: number;
        if (content[destinationStart] === "<") {
            const angleEnd = findUnescapedDelimiter(content, ">", destinationStart + 1);
            if (angleEnd < 0 || content[angleEnd + 1] !== ")") continue;
            target = content.slice(destinationStart + 1, angleEnd);
            destinationEnd = angleEnd + 1;
        } else {
            destinationEnd = findUnescapedDelimiter(content, ")", destinationStart);
            if (destinationEnd < 0) continue;
            target = content.slice(destinationStart, destinationEnd);
        }
        occurrences.push({ start, end: destinationEnd + 1, target });
        start = destinationEnd;
    }
    return occurrences;
}

export function classifyCircleReference(
    target: string,
): Omit<CircleReferenceOccurrence, "start" | "end" | "target"> | null {
    if (!target.startsWith("/circles/")) return null;
    const encodedIdentifier = target.slice("/circles/".length);
    if (
        !encodedIdentifier ||
        encodedIdentifier.includes("/") ||
        encodedIdentifier.includes("?") ||
        encodedIdentifier.includes("#") ||
        /\s/.test(target)
    ) {
        return { identifier: null };
    }
    let identifier: string;
    try {
        identifier = decodeURIComponent(encodedIdentifier);
    } catch {
        return { identifier: null };
    }
    if (!identifier || identifier.includes("/") || identifier.includes("?") || identifier.includes("#") || /\s/.test(identifier)) {
        return { identifier: null };
    }
    if (ObjectId.isValid(identifier)) {
        const objectId = new ObjectId(identifier).toHexString();
        return { identifier, objectId };
    }
    return { identifier, handle: identifier };
}

export function parseCircleReferenceOccurrences(content: string): CircleReferenceOccurrence[] {
    return findCompleteMarkdownLinkOccurrences(content).flatMap((link) => {
        const classified = classifyCircleReference(link.target);
        return classified ? [{ ...link, ...classified }] : [];
    });
}

// Fail closed only for an unescaped, non-image Markdown link whose destination visibly starts as a Circle route.
export function hasIncompleteCircleReferenceAttempt(content: string): boolean {
    for (let start = 0; start < content.length; start += 1) {
        if (content[start] !== "[" || isMarkdownDelimiterEscaped(content, start)) continue;
        if (start > 0 && content[start - 1] === "!" && !isMarkdownDelimiterEscaped(content, start - 1)) continue;
        const labelEnd = findUnescapedDelimiter(content, "]", start + 1);
        if (labelEnd < 0 || content[labelEnd + 1] !== "(") continue;
        const destinationStart = labelEnd + 2;
        const destination = content.slice(destinationStart);
        if (destination.startsWith("/circles/") && findUnescapedDelimiter(content, ")", destinationStart) < 0) return true;
        if (destination.startsWith("</circles/")) {
            const angleEnd = findUnescapedDelimiter(content, ">", destinationStart + 1);
            if (angleEnd < 0 || content[angleEnd + 1] !== ")") return true;
        }
    }
    return false;
}

export function escapeCircleMarkdownLabel(name: string): string {
    return name.replace(/[\\[\]]/g, "\\$&");
}

export function canonicalCircleMarkdown(circle: { name: string; handle: string }): string {
    return `[${escapeCircleMarkdownLabel(circle.name)}](/circles/${circle.handle})`;
}
