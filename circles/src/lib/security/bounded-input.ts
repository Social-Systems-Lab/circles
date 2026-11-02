import { z, type ZodTypeAny } from "zod";

export const INPUT_LIMITS = {
    maxArrayItems: 500,
    maxObjectFields: 200,
    maxDepth: 20,
    maxValues: 10_000,
    maxStringLength: 100_000,
    maxKeyLength: 200,
} as const;

type InputLimitOverrides = Partial<Record<keyof typeof INPUT_LIMITS, number>>;

export type BoundedParseResult<T extends ZodTypeAny> = ReturnType<T["safeParse"]>;

/** Rejects pathological input before Zod can accumulate issues for every element. */
export function boundedSafeParse<T extends ZodTypeAny>(
    schema: T,
    input: unknown,
    limits: InputLimitOverrides = {},
): BoundedParseResult<T> {
    const failure = inspectInputBounds(input, limits);
    if (failure) {
        return {
            success: false,
            error: new z.ZodError([{ code: z.ZodIssueCode.custom, path: failure.path, message: failure.message }]),
        } as BoundedParseResult<T>;
    }
    return schema.safeParse(input) as BoundedParseResult<T>;
}

export function inspectInputBounds(
    input: unknown,
    overrides: InputLimitOverrides = {},
): { path: (string | number)[]; message: string } | null {
    const limits = { ...INPUT_LIMITS, ...overrides };
    const stack: { value: unknown; path: (string | number)[]; depth: number }[] = [
        { value: input, path: [], depth: 0 },
    ];
    let visited = 0;

    while (stack.length) {
        const current = stack.pop()!;
        visited += 1;
        if (visited > limits.maxValues) return { path: current.path, message: "Input contains too many values" };
        if (current.depth > limits.maxDepth) return { path: current.path, message: "Input is nested too deeply" };

        if (typeof current.value === "string" && current.value.length > limits.maxStringLength) {
            return { path: current.path, message: "A text field is too long" };
        }

        if (Array.isArray(current.value)) {
            if (current.value.length > limits.maxArrayItems) {
                return { path: current.path, message: `A list may contain at most ${limits.maxArrayItems} items` };
            }
            for (let index = current.value.length - 1; index >= 0; index -= 1) {
                stack.push({ value: current.value[index], path: [...current.path, index], depth: current.depth + 1 });
            }
            continue;
        }

        if (
            current.value &&
            typeof current.value === "object" &&
            !(typeof Blob !== "undefined" && current.value instanceof Blob) &&
            !(current.value instanceof Date)
        ) {
            let fieldCount = 0;
            for (const key in current.value) {
                if (!Object.prototype.hasOwnProperty.call(current.value, key)) continue;
                fieldCount += 1;
                if (fieldCount > limits.maxObjectFields) {
                    return {
                        path: current.path,
                        message: `An object may contain at most ${limits.maxObjectFields} fields`,
                    };
                }
                if (key.length > limits.maxKeyLength)
                    return { path: current.path, message: "An input field name is too long" };
                stack.push({
                    value: (current.value as Record<string, unknown>)[key],
                    path: [...current.path, key],
                    depth: current.depth + 1,
                });
            }
        }
    }
    return null;
}

export type LimitedJsonResult =
    | { ok: true; value: unknown }
    | { ok: false; status: 400 | 413; error: "Invalid JSON" | "Request body too large" };

export type LimitedTextResult =
    | { ok: true; value: string }
    | { ok: false; status: 413; error: "Request body too large" };

export function inspectFormDataBounds(formData: FormData): { message: string } | null {
    let fields = 0;
    const repeatedFields = new Map<string, number>();
    for (const [name, value] of formData.entries()) {
        fields += 1;
        const count = (repeatedFields.get(name) ?? 0) + 1;
        repeatedFields.set(name, count);
        if (fields > INPUT_LIMITS.maxObjectFields + 10_000) return { message: "Form contains too many fields" };
        const maxCount =
            name === "images" || name === "resultImages"
                ? 20
                : name === "rankedItemIds"
                  ? 10_000
                  : name === "userGroups"
                    ? 500
                    : INPUT_LIMITS.maxArrayItems;
        if (count > maxCount) return { message: `Too many values for ${name}` };
        if (typeof value === "string" && value.length > INPUT_LIMITS.maxStringLength) {
            return { message: "A text field is too long" };
        }
        if (
            typeof value === "string" &&
            ["location", "recurrence", "hostCircleIds", "images", "resultImages"].includes(name) &&
            /^[\s]*[\[{]/.test(value)
        ) {
            try {
                const parsed: unknown = JSON.parse(value);
                const nestedBounds = inspectInputBounds(parsed, {
                    maxArrayItems: maxCount,
                    maxStringLength: INPUT_LIMITS.maxStringLength,
                });
                if (nestedBounds) return { message: nestedBounds.message };
            } catch {
                // Preserve the existing schema's malformed-JSON validation message.
            }
        }
        if (typeof value !== "string" && value.size > 50 * 1024 * 1024) {
            return { message: "An uploaded file is too large" };
        }
    }
    return null;
}

/** Preflights repeated string IDs before Zod so one request cannot create thousands of issues. */
export function inspectRepeatedStringFieldBounds(
    formData: FormData,
    name: string,
    maxItems: number,
    maxStringLength = 128,
): { message: string } | null {
    const values = formData.getAll(name);
    if (values.length > maxItems) return { message: `A list may contain at most ${maxItems} items` };
    for (const value of values) {
        if (typeof value !== "string" || value.length === 0 || value.length > maxStringLength) {
            return { message: "A list contains an invalid item" };
        }
    }
    return null;
}

export function inspectSerializedArrayBounds(
    value: unknown,
    maxItems: number,
    limits: InputLimitOverrides = {},
): { message: string } | null {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
        const parsed: unknown = JSON.parse(value);
        if (Array.isArray(parsed) && parsed.length > maxItems) {
            return { message: `A list may contain at most ${maxItems} items` };
        }
        return inspectInputBounds(parsed, { ...limits, maxArrayItems: maxItems });
    } catch {
        return null; // The schema retains responsibility for malformed JSON feedback.
    }
}

/** Reads JSON with an actual streamed byte cap; Content-Length is only an early hint. */
export async function readTextBodyLimited(request: Request, maxBytes: number): Promise<LimitedTextResult> {
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        return { ok: false, status: 413, error: "Request body too large" };
    }

    if (!request.body) return { ok: true, value: "" };
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) {
                await reader.cancel();
                return { ok: false, status: 413, error: "Request body too large" };
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return { ok: true, value: new TextDecoder().decode(bytes) };
}

export async function readJsonBodyLimited(request: Request, maxBytes: number): Promise<LimitedJsonResult> {
    const text = await readTextBodyLimited(request, maxBytes);
    if (!text.ok) return text;
    try {
        return { ok: true, value: JSON.parse(text.value) as unknown };
    } catch {
        return { ok: false, status: 400, error: "Invalid JSON" };
    }
}
