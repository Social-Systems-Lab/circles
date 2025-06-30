export function sanitizeObjectForJSON(obj: any): any {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => sanitizeObjectForJSON(item));
    }

    if (typeof obj === "object") {
        const newObj: { [key: string]: any } = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                newObj[key] = sanitizeObjectForJSON(obj[key]);
            }
        }
        return newObj;
    }

    if (typeof obj === "number" && !Number.isInteger(obj)) {
        return obj.toString();
    }

    return obj;
}
