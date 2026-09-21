// In-memory stand-in for a MongoDB collection, for unit tests of modules that read and write Mongo.
//
// It implements the query and update operators this codebase relies on with MongoDB's own
// semantics (array traversal in dotted paths, `null` matching missing fields, type-strict ObjectId
// equality, upserts). Anything it does not implement throws, so a test can never silently pass
// against an operator the fake ignores. Aggregation pipelines are not emulated: tests provide the
// result through `onAggregate` and assert on the pipeline they were called with.

import { ObjectId } from "mongodb";

export type Doc = Record<string, any>;
export type Filter = Record<string, any>;
export type Update = Record<string, any>;

const isObjectId = (value: unknown): value is ObjectId => value instanceof ObjectId;
const isPlainObject = (value: unknown): value is Doc =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof RegExp) &&
    !isObjectId(value);

export const clone = <T>(value: T): T => {
    if (isObjectId(value)) return new ObjectId(value.toHexString()) as T;
    if (value instanceof Date) return new Date(value.getTime()) as T;
    if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
    if (isPlainObject(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
    }
    return value;
};

const valuesEqual = (a: unknown, b: unknown): boolean => {
    if (isObjectId(a) || isObjectId(b)) return isObjectId(a) && isObjectId(b) && a.equals(b);
    if (a instanceof Date || b instanceof Date) {
        return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        return (
            Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => valuesEqual(item, b[i]))
        );
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        return keysA.length === keysB.length && keysA.every((key) => key in b && valuesEqual(a[key], b[key]));
    }
    return a === b;
};

/** Resolve a dotted path to every value it can address, traversing arrays like MongoDB does. */
const resolvePath = (source: unknown, segments: string[]): unknown[] => {
    if (segments.length === 0) return [source];
    if (Array.isArray(source)) {
        const [head, ...rest] = segments;
        if (/^\d+$/.test(head)) return resolvePath(source[Number(head)], rest);
        return source.flatMap((item) => resolvePath(item, segments));
    }
    if (!isPlainObject(source)) return [];
    const [head, ...rest] = segments;
    return head in source ? resolvePath(source[head], rest) : [];
};

const compare = (a: unknown, b: unknown): number => {
    // MongoDB sorts missing and null values below everything else, and false below true.
    if (a == null || b == null) return a == null && b == null ? 0 : a == null ? -1 : 1;
    if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
    if (isObjectId(a) && isObjectId(b)) return a.toHexString() < b.toHexString() ? -1 : a.equals(b) ? 0 : 1;
    return 0;
};

const isComparable = (a: unknown, b: unknown): boolean =>
    (a instanceof Date && b instanceof Date) ||
    (typeof a === "number" && typeof b === "number") ||
    (typeof a === "string" && typeof b === "string") ||
    (isObjectId(a) && isObjectId(b));

const isOperatorObject = (value: unknown): value is Doc =>
    isPlainObject(value) && Object.keys(value).length > 0 && Object.keys(value).every((key) => key.startsWith("$"));

const hasBsonType = (value: unknown, type: string | number): boolean => {
    const matches = (name: string): boolean => {
        switch (name) {
            case "string":
                return typeof value === "string";
            case "number":
                return typeof value === "number";
            case "int":
            case "long":
                return typeof value === "number" && Number.isInteger(value);
            case "double":
                return typeof value === "number";
            case "bool":
                return typeof value === "boolean";
            case "date":
                return value instanceof Date;
            case "objectId":
                return isObjectId(value);
            case "null":
                return value === null;
            case "array":
                return Array.isArray(value);
            case "object":
                return isPlainObject(value);
            default:
                throw new Error(`FakeCollection: unsupported $type ${name}`);
        }
    };
    return matches(String(type));
};

const matchesEquality = (candidates: unknown[], expected: unknown): boolean => {
    if (expected === null) return candidates.length === 0 || candidates.some((c) => c === null || c === undefined);
    if (expected instanceof RegExp) {
        return candidates.some((c) => typeof c === "string" && expected.test(c));
    }
    return candidates.some((candidate) => {
        if (valuesEqual(candidate, expected)) return true;
        return Array.isArray(candidate) && candidate.some((item) => valuesEqual(item, expected));
    });
};

const matchesOperator = (candidates: unknown[], operator: string, operand: any, options?: string): boolean => {
    switch (operator) {
        case "$eq":
            return matchesEquality(candidates, operand);
        case "$ne":
            return !matchesEquality(candidates, operand);
        case "$in":
            return (operand as unknown[]).some((item) => matchesEquality(candidates, item));
        case "$nin":
            return !(operand as unknown[]).some((item) => matchesEquality(candidates, item));
        case "$exists":
            return operand ? candidates.length > 0 : candidates.length === 0;
        case "$gt":
        case "$gte":
        case "$lt":
        case "$lte": {
            const flat = candidates.flatMap((candidate) => (Array.isArray(candidate) ? candidate : [candidate]));
            return flat.some((candidate) => {
                if (!isComparable(candidate, operand)) return false;
                const order = compare(candidate, operand);
                return operator === "$gt"
                    ? order > 0
                    : operator === "$gte"
                      ? order >= 0
                      : operator === "$lt"
                        ? order < 0
                        : order <= 0;
            });
        }
        case "$regex": {
            const pattern = operand instanceof RegExp ? operand : new RegExp(operand, options);
            return candidates.some((c) => typeof c === "string" && pattern.test(c));
        }
        case "$type":
            // Like MongoDB, an array field matches when it is an array itself or any element has the type.
            return candidates.some(
                (c) => hasBsonType(c, operand) || (Array.isArray(c) && c.some((item) => hasBsonType(item, operand))),
            );
        case "$size":
            return candidates.some((c) => Array.isArray(c) && c.length === operand);
        case "$all":
            return (operand as unknown[]).every((item) => matchesEquality(candidates, item));
        case "$elemMatch":
            return candidates.some(
                (c) =>
                    Array.isArray(c) &&
                    c.some((item) =>
                        isOperatorObject(operand)
                            ? matchesFieldCondition([item], operand)
                            : isPlainObject(item) && matchesFilter(item, operand),
                    ),
            );
        case "$not":
            return !matchesFieldCondition(candidates, operand);
        case "$options":
            return true;
        default:
            throw new Error(`FakeCollection: unsupported query operator ${operator}`);
    }
};

const matchesFieldCondition = (candidates: unknown[], condition: unknown): boolean => {
    if (isOperatorObject(condition)) {
        return Object.entries(condition).every(([operator, operand]) =>
            matchesOperator(candidates, operator, operand, (condition as Doc).$options),
        );
    }
    return matchesEquality(candidates, condition);
};

export const matchesFilter = (doc: Doc, filter: Filter = {}): boolean =>
    Object.entries(filter).every(([key, condition]) => {
        if (key === "$and") return (condition as Filter[]).every((sub) => matchesFilter(doc, sub));
        if (key === "$or") return (condition as Filter[]).some((sub) => matchesFilter(doc, sub));
        if (key === "$nor") return !(condition as Filter[]).some((sub) => matchesFilter(doc, sub));
        if (key.startsWith("$")) throw new Error(`FakeCollection: unsupported top-level operator ${key}`);
        return matchesFieldCondition(resolvePath(doc, key.split(".")), condition);
    });

const getPath = (doc: Doc, path: string): unknown => {
    let current: unknown = doc;
    for (const segment of path.split(".")) {
        if (!isPlainObject(current) && !Array.isArray(current)) return undefined;
        current = (current as any)[segment];
    }
    return current;
};

const setPath = (doc: Doc, path: string, value: unknown) => {
    if (path.split(".").some((segment) => segment === "$" || segment === "$[]" || segment.startsWith("$["))) {
        throw new Error(`FakeCollection: positional update operators are not supported (${path})`);
    }
    const segments = path.split(".");
    let current: any = doc;
    for (const segment of segments.slice(0, -1)) {
        if (!isPlainObject(current[segment]) && !Array.isArray(current[segment])) current[segment] = {};
        current = current[segment];
    }
    current[segments[segments.length - 1]] = value;
};

const unsetPath = (doc: Doc, path: string) => {
    const segments = path.split(".");
    let current: any = doc;
    for (const segment of segments.slice(0, -1)) {
        if (current == null || typeof current !== "object") return;
        current = current[segment];
    }
    if (current != null && typeof current === "object") delete current[segments[segments.length - 1]];
};

const eachValue = (operand: any): unknown[] => (isPlainObject(operand) && "$each" in operand ? operand.$each : [operand]);

const applyUpdate = (doc: Doc, update: Update, isInsert: boolean) => {
    const operators = Object.keys(update);
    if (operators.length === 0 || operators.some((key) => !key.startsWith("$"))) {
        throw new Error("FakeCollection: update documents must consist of update operators");
    }
    for (const operator of operators) {
        const spec = update[operator] as Doc;
        for (const [path, operand] of Object.entries(spec)) {
            switch (operator) {
                case "$set":
                    setPath(doc, path, clone(operand));
                    break;
                case "$setOnInsert":
                    if (isInsert) setPath(doc, path, clone(operand));
                    break;
                case "$unset":
                    unsetPath(doc, path);
                    break;
                case "$inc":
                    setPath(doc, path, ((getPath(doc, path) as number | undefined) ?? 0) + (operand as number));
                    break;
                case "$min": {
                    const current = getPath(doc, path);
                    if (current === undefined || compare(operand, current) < 0) setPath(doc, path, clone(operand));
                    break;
                }
                case "$max": {
                    const current = getPath(doc, path);
                    if (current === undefined || compare(operand, current) > 0) setPath(doc, path, clone(operand));
                    break;
                }
                case "$push": {
                    const current = (getPath(doc, path) as unknown[] | undefined) ?? [];
                    setPath(doc, path, [...current, ...eachValue(operand).map((item) => clone(item))]);
                    break;
                }
                case "$addToSet": {
                    const next = [...(((getPath(doc, path) as unknown[] | undefined) ?? []) as unknown[])];
                    for (const item of eachValue(operand)) {
                        if (!next.some((existing) => valuesEqual(existing, item))) next.push(clone(item));
                    }
                    setPath(doc, path, next);
                    break;
                }
                case "$pull": {
                    const current = getPath(doc, path);
                    if (!Array.isArray(current)) break;
                    setPath(
                        doc,
                        path,
                        current.filter((item) =>
                            isOperatorObject(operand)
                                ? !matchesFieldCondition([item], operand)
                                : isPlainObject(operand) && isPlainObject(item)
                                  ? !matchesFilter(item, operand)
                                  : !valuesEqual(item, operand),
                        ),
                    );
                    break;
                }
                case "$pullAll": {
                    const current = getPath(doc, path);
                    if (!Array.isArray(current)) break;
                    setPath(
                        doc,
                        path,
                        current.filter((item) => !(operand as unknown[]).some((removed) => valuesEqual(item, removed))),
                    );
                    break;
                }
                case "$currentDate":
                    setPath(doc, path, new Date());
                    break;
                default:
                    throw new Error(`FakeCollection: unsupported update operator ${operator}`);
            }
        }
    }
};

/** Seed an upserted document from the equality conditions of the filter. */
const seedFromFilter = (filter: Filter): Doc => {
    const seed: Doc = {};
    for (const [key, condition] of Object.entries(filter)) {
        if (key.startsWith("$")) continue;
        if (isOperatorObject(condition)) {
            if ("$eq" in condition) setPath(seed, key, clone(condition.$eq));
        } else {
            setPath(seed, key, clone(condition));
        }
    }
    return seed;
};

const project = (doc: Doc, projection?: Doc): Doc => {
    if (!projection || Object.keys(projection).length === 0) return clone(doc);
    const entries = Object.entries(projection).filter(([key]) => key !== "_id");
    const includes = entries.some(([, flag]) => flag === 1 || flag === true);
    const excludeId = projection._id === 0 || projection._id === false;
    if (includes) {
        const result: Doc = {};
        if (!excludeId && "_id" in doc) result._id = clone(doc._id);
        for (const [key, flag] of entries) {
            if (!flag) continue;
            const value = getPath(doc, key);
            if (value !== undefined) setPath(result, key, clone(value));
        }
        return result;
    }
    const result = clone(doc);
    for (const [key] of entries) unsetPath(result, key);
    if (excludeId) delete result._id;
    return result;
};

type FindOptions = { projection?: Doc; sort?: Record<string, 1 | -1>; limit?: number; skip?: number };

export class FakeCursor<T extends Doc = Doc> implements AsyncIterable<T> {
    private sortSpec?: Record<string, 1 | -1>;
    private limitCount = 0;
    private skipCount = 0;
    private projection?: Doc;

    constructor(
        private readonly docs: T[],
        options: FindOptions = {},
    ) {
        this.sortSpec = options.sort;
        this.limitCount = options.limit ?? 0;
        this.skipCount = options.skip ?? 0;
        this.projection = options.projection;
    }

    sort(spec: Record<string, 1 | -1>) {
        this.sortSpec = spec;
        return this;
    }
    limit(count: number) {
        this.limitCount = count;
        return this;
    }
    skip(count: number) {
        this.skipCount = count;
        return this;
    }
    project(projection: Doc) {
        this.projection = projection;
        return this;
    }

    async toArray(): Promise<T[]> {
        let result = [...this.docs];
        if (this.sortSpec) {
            const spec = Object.entries(this.sortSpec);
            result.sort((a, b) => {
                for (const [path, direction] of spec) {
                    const order = compare(getPath(a, path), getPath(b, path));
                    if (order !== 0) return order * direction;
                }
                return 0;
            });
        }
        result = result.slice(this.skipCount);
        if (this.limitCount > 0) result = result.slice(0, this.limitCount);
        return result.map((doc) => project(doc, this.projection) as T);
    }

    async next(): Promise<T | null> {
        return (await this.toArray())[0] ?? null;
    }

    async *[Symbol.asyncIterator](): AsyncIterator<T> {
        for (const doc of await this.toArray()) yield doc;
    }
}

export class FakeCollection<T extends Doc = Doc> {
    /** The stored documents. Reads return copies; assert against this to check persisted state. */
    docs: T[];

    /** Supplies the result of `aggregate`. Without it, calling `aggregate` fails the test loudly. */
    onAggregate?: (pipeline: Doc[], options?: unknown) => Doc[] | Promise<Doc[]>;
    /** Every pipeline passed to `aggregate`, in call order. */
    aggregations: Doc[][] = [];

    constructor(initial: T[] = []) {
        this.docs = initial.map((doc) => this.withId(clone(doc)));
    }

    /** The stored document with this `_id` (the live object, not a copy), for asserting on persisted state. */
    byId(id: unknown): T | undefined {
        return this.docs.find((doc) => valuesEqual(doc._id, id));
    }

    private withId(doc: T): T {
        if (doc._id === undefined) (doc as Doc)._id = new ObjectId();
        return doc;
    }

    private matching(filter: Filter = {}): T[] {
        return this.docs.filter((doc) => matchesFilter(doc, filter));
    }

    async findOne(filter: Filter = {}, options: FindOptions = {}): Promise<T | null> {
        const cursor = new FakeCursor(this.matching(filter), { ...options, limit: 1 });
        return (await cursor.next()) as T | null;
    }

    find(filter: Filter = {}, options: FindOptions = {}): FakeCursor<T> {
        return new FakeCursor(this.matching(filter), options);
    }

    async countDocuments(filter: Filter = {}): Promise<number> {
        return this.matching(filter).length;
    }

    async distinct(field: string, filter: Filter = {}): Promise<unknown[]> {
        const values: unknown[] = [];
        for (const doc of this.matching(filter)) {
            for (const value of resolvePath(doc, field.split("."))) {
                for (const item of Array.isArray(value) ? value : [value]) {
                    if (!values.some((existing) => valuesEqual(existing, item))) values.push(clone(item));
                }
            }
        }
        return values;
    }

    async insertOne(doc: T) {
        const stored = this.withId(clone(doc));
        if (this.docs.some((existing) => valuesEqual(existing._id, stored._id))) {
            throw Object.assign(new Error(`E11000 duplicate key error: _id ${String(stored._id)}`), { code: 11000 });
        }
        this.docs.push(stored);
        return { acknowledged: true, insertedId: stored._id };
    }

    async insertMany(docs: T[]) {
        const insertedIds: Record<number, unknown> = {};
        for (const [index, doc] of docs.entries()) {
            insertedIds[index] = (await this.insertOne(doc)).insertedId;
        }
        return { acknowledged: true, insertedCount: docs.length, insertedIds };
    }

    private applyToDoc(doc: T, update: Update, isInsert = false) {
        applyUpdate(doc, update, isInsert);
    }

    async updateOne(filter: Filter, update: Update, options: { upsert?: boolean } = {}) {
        return this.updateOneNow(filter, update, options);
    }

    // Runs to completion without yielding, so read-modify-write operations are atomic like MongoDB's.
    private updateOneNow(filter: Filter, update: Update, options: { upsert?: boolean } = {}) {
        const target = this.matching(filter)[0];
        if (target) {
            const before = clone(target);
            this.applyToDoc(target, update);
            return {
                acknowledged: true,
                matchedCount: 1,
                modifiedCount: valuesEqual(before, target) ? 0 : 1,
                upsertedCount: 0,
                upsertedId: null,
            };
        }
        if (!options.upsert) {
            return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null };
        }
        const created = this.withId(seedFromFilter(filter) as T);
        this.applyToDoc(created, update, true);
        this.docs.push(created);
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: created._id };
    }

    async updateMany(filter: Filter, update: Update, options: { upsert?: boolean } = {}) {
        const targets = this.matching(filter);
        if (targets.length === 0 && options.upsert) return this.updateOne(filter, update, options);
        let modifiedCount = 0;
        for (const target of targets) {
            const before = clone(target);
            this.applyToDoc(target, update);
            if (!valuesEqual(before, target)) modifiedCount += 1;
        }
        return {
            acknowledged: true,
            matchedCount: targets.length,
            modifiedCount,
            upsertedCount: 0,
            upsertedId: null,
        };
    }

    async replaceOne(filter: Filter, replacement: T, options: { upsert?: boolean } = {}) {
        const index = this.docs.findIndex((doc) => matchesFilter(doc, filter));
        if (index === -1) {
            if (!options.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
            const created = this.withId(clone(replacement));
            this.docs.push(created);
            return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: created._id };
        }
        this.docs[index] = { ...clone(replacement), _id: this.docs[index]._id };
        return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    }

    async findOneAndUpdate(
        filter: Filter,
        update: Update,
        options: { upsert?: boolean; returnDocument?: "before" | "after"; projection?: Doc } = {},
    ): Promise<T | null> {
        const before = this.matching(filter)[0];
        const beforeCopy = before ? clone(before) : null;
        const result = this.updateOneNow(filter, update, { upsert: options.upsert });
        const after =
            result.upsertedId != null
                ? this.docs.find((doc) => valuesEqual(doc._id, result.upsertedId))
                : before && this.docs.find((doc) => valuesEqual(doc._id, before._id));
        const chosen = options.returnDocument === "after" ? after : beforeCopy;
        return chosen ? (project(chosen, options.projection) as T) : null;
    }

    async deleteOne(filter: Filter) {
        const index = this.docs.findIndex((doc) => matchesFilter(doc, filter));
        if (index === -1) return { acknowledged: true, deletedCount: 0 };
        this.docs.splice(index, 1);
        return { acknowledged: true, deletedCount: 1 };
    }

    async deleteMany(filter: Filter = {}) {
        const before = this.docs.length;
        this.docs = this.docs.filter((doc) => !matchesFilter(doc, filter));
        return { acknowledged: true, deletedCount: before - this.docs.length };
    }

    async createIndex(_spec?: unknown, _options?: unknown) {
        return "fake_index";
    }

    aggregate(pipeline: Doc[], options?: unknown) {
        this.aggregations.push(pipeline);
        if (!this.onAggregate) {
            throw new Error("FakeCollection: aggregate() called without an onAggregate handler");
        }
        const handler = this.onAggregate;
        const cursor = new FakeCursor<Doc>([]);
        cursor.toArray = async () => (await handler(pipeline, options)).map((doc) => clone(doc));
        return cursor;
    }
}
