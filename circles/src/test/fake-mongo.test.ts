import { describe, expect, test } from "bun:test";
import { ObjectId } from "mongodb";
import { type Doc, FakeCollection, clone, matchesFilter } from "./fake-mongo";

const collectionOf = (...docs: Doc[]) => new FakeCollection(docs);
const ids = async (collection: FakeCollection, filter = {}) =>
    (await collection.find(filter).toArray()).map((doc) => doc.n ?? doc.name);

describe("clone", () => {
    test("deep-copies plain objects, arrays, dates and object ids", () => {
        const original = { list: [{ a: 1 }], when: new Date(5), id: new ObjectId() };
        const copy = clone(original);

        expect(copy).toEqual(original);
        expect(copy.list).not.toBe(original.list);
        expect(copy.list[0]).not.toBe(original.list[0]);
        expect(copy.when).not.toBe(original.when);
        expect(copy.id).not.toBe(original.id);
        expect(copy.id.equals(original.id)).toBe(true);
    });

    test("returns primitives, null and undefined as they are", () => {
        expect(clone(5)).toBe(5);
        expect(clone("x")).toBe("x");
        expect(clone(null)).toBeNull();
        expect(clone(undefined)).toBeUndefined();
    });
});

describe("matchesFilter", () => {
    test("matches everything for an empty filter", () => {
        expect(matchesFilter({ a: 1 }, {})).toBe(true);
        expect(matchesFilter({ a: 1 })).toBe(true);
    });

    test("matches by equality and requires all fields to match", () => {
        expect(matchesFilter({ a: 1, b: 2 }, { a: 1 })).toBe(true);
        expect(matchesFilter({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
    });

    test("does not coerce types", () => {
        expect(matchesFilter({ a: 1 }, { a: "1" })).toBe(false);
    });

    test("compares object ids by value and never against their string form", () => {
        const id = new ObjectId();
        expect(matchesFilter({ _id: id }, { _id: new ObjectId(id.toHexString()) })).toBe(true);
        expect(matchesFilter({ _id: id }, { _id: id.toHexString() })).toBe(false);
        expect(matchesFilter({ _id: id.toHexString() }, { _id: id })).toBe(false);
    });

    test("compares dates by time value", () => {
        expect(matchesFilter({ at: new Date(5) }, { at: new Date(5) })).toBe(true);
        expect(matchesFilter({ at: new Date(5) }, { at: new Date(6) })).toBe(false);
    });

    test("matches nested values through dotted paths", () => {
        expect(matchesFilter({ a: { b: { c: 1 } } }, { "a.b.c": 1 })).toBe(true);
        expect(matchesFilter({ a: { b: 1 } }, { "a.x": 1 })).toBe(false);
    });

    test("compares whole sub-documents structurally", () => {
        expect(matchesFilter({ a: { b: 1, c: 2 } }, { a: { b: 1, c: 2 } })).toBe(true);
        expect(matchesFilter({ a: { b: 1, c: 2 } }, { a: { b: 1 } })).toBe(false);
    });

    test("traverses arrays of sub-documents in dotted paths", () => {
        const doc = { items: [{ k: "a" }, { k: "b" }] };
        expect(matchesFilter(doc, { "items.k": "b" })).toBe(true);
        expect(matchesFilter(doc, { "items.k": "z" })).toBe(false);
        expect(matchesFilter(doc, { "items.1.k": "b" })).toBe(true);
    });

    test("matches an array field when any element equals the value, or the whole array does", () => {
        expect(matchesFilter({ tags: ["a", "b"] }, { tags: "b" })).toBe(true);
        expect(matchesFilter({ tags: ["a", "b"] }, { tags: "c" })).toBe(false);
        expect(matchesFilter({ tags: ["a", "b"] }, { tags: ["a", "b"] })).toBe(true);
        expect(matchesFilter({ tags: ["a", "b"] }, { tags: ["b", "a"] })).toBe(false);
    });

    test("matches null against both null and missing fields", () => {
        expect(matchesFilter({ a: null }, { a: null })).toBe(true);
        expect(matchesFilter({}, { a: null })).toBe(true);
        expect(matchesFilter({ a: 0 }, { a: null })).toBe(false);
    });

    test("matches regular expressions against strings only", () => {
        expect(matchesFilter({ a: "Hello" }, { a: /^hel/i })).toBe(true);
        expect(matchesFilter({ a: "Hello" }, { a: /^bye/ })).toBe(false);
        expect(matchesFilter({ a: 5 }, { a: /5/ })).toBe(false);
    });

    describe("comparison operators", () => {
        test("$eq and $ne", () => {
            expect(matchesFilter({ a: 1 }, { a: { $eq: 1 } })).toBe(true);
            expect(matchesFilter({ a: 1 }, { a: { $ne: 1 } })).toBe(false);
            expect(matchesFilter({ a: 1 }, { a: { $ne: 2 } })).toBe(true);
            expect(matchesFilter({}, { a: { $ne: 2 } })).toBe(true);
        });

        test("$in and $nin", () => {
            expect(matchesFilter({ a: 1 }, { a: { $in: [1, 2] } })).toBe(true);
            expect(matchesFilter({ a: 3 }, { a: { $in: [1, 2] } })).toBe(false);
            expect(matchesFilter({ a: 3 }, { a: { $nin: [1, 2] } })).toBe(true);
            expect(matchesFilter({ a: 1 }, { a: { $nin: [1, 2] } })).toBe(false);
            expect(matchesFilter({ tags: ["x", "y"] }, { tags: { $in: ["y"] } })).toBe(true);
            expect(matchesFilter({}, { a: { $in: [null] } })).toBe(true);
        });

        test("$in works with object ids", () => {
            const id = new ObjectId();
            expect(matchesFilter({ _id: id }, { _id: { $in: [new ObjectId(id.toHexString())] } })).toBe(true);
            expect(matchesFilter({ _id: id }, { _id: { $in: [new ObjectId()] } })).toBe(false);
        });

        test.each([
            ["$gt", 5, 6, true],
            ["$gt", 5, 5, false],
            ["$gte", 5, 5, true],
            ["$gte", 5, 4, false],
            ["$lt", 5, 4, true],
            ["$lt", 5, 5, false],
            ["$lte", 5, 5, true],
            ["$lte", 5, 6, false],
        ])("%s %d matches a stored %d: %p", (operator, bound, value, expected) => {
            expect(matchesFilter({ n: value }, { n: { [operator]: bound } })).toBe(expected);
        });

        test("range operators compare dates and strings, and ignore mismatched types", () => {
            expect(matchesFilter({ at: new Date(10) }, { at: { $gt: new Date(5) } })).toBe(true);
            expect(matchesFilter({ s: "b" }, { s: { $gt: "a" } })).toBe(true);
            expect(matchesFilter({ n: "10" }, { n: { $gt: 5 } })).toBe(false);
            expect(matchesFilter({}, { n: { $lt: 5 } })).toBe(false);
        });

        test("combines several operators on one field", () => {
            expect(matchesFilter({ n: 5 }, { n: { $gt: 1, $lt: 10 } })).toBe(true);
            expect(matchesFilter({ n: 50 }, { n: { $gt: 1, $lt: 10 } })).toBe(false);
        });
    });

    describe("element operators", () => {
        test("$exists distinguishes missing from null", () => {
            expect(matchesFilter({ a: null }, { a: { $exists: true } })).toBe(true);
            expect(matchesFilter({}, { a: { $exists: true } })).toBe(false);
            expect(matchesFilter({}, { a: { $exists: false } })).toBe(true);
            expect(matchesFilter({ a: 0 }, { a: { $exists: false } })).toBe(false);
        });

        test("$regex with $options", () => {
            expect(matchesFilter({ a: "Hello" }, { a: { $regex: "^hel", $options: "i" } })).toBe(true);
            expect(matchesFilter({ a: "Hello" }, { a: { $regex: "^hel" } })).toBe(false);
        });

        test("$size, $all and $elemMatch", () => {
            expect(matchesFilter({ a: [1, 2] }, { a: { $size: 2 } })).toBe(true);
            expect(matchesFilter({ a: [1, 2] }, { a: { $size: 3 } })).toBe(false);
            expect(matchesFilter({ a: [1, 2, 3] }, { a: { $all: [1, 3] } })).toBe(true);
            expect(matchesFilter({ a: [1, 2] }, { a: { $all: [1, 3] } })).toBe(false);
            expect(matchesFilter({ a: [{ k: 1, v: 2 }] }, { a: { $elemMatch: { k: 1, v: 2 } } })).toBe(true);
            expect(matchesFilter({ a: [{ k: 1 }, { v: 2 }] }, { a: { $elemMatch: { k: 1, v: 2 } } })).toBe(false);
            expect(matchesFilter({ a: [1, 5] }, { a: { $elemMatch: { $gt: 4 } } })).toBe(true);
        });

        test.each([
            ["string", "x", true],
            ["string", 1, false],
            ["number", 1.5, true],
            ["number", "1", false],
            ["int", 2, true],
            ["int", 2.5, false],
            ["bool", false, true],
            ["bool", 0, false],
            ["date", new Date(), true],
            ["date", "2026-01-01", false],
            ["null", null, true],
            ["array", [1], true],
            ["array", { 0: 1 }, false],
            ["object", { a: 1 }, true],
            ["object", [1], false],
        ])("$type %s against %p is %p", (type, value, expected) => {
            expect(matchesFilter({ v: value }, { v: { $type: type } })).toBe(expected);
        });

        test("$type matches object ids and array elements, and never matches a missing field", () => {
            expect(matchesFilter({ v: new ObjectId() }, { v: { $type: "objectId" } })).toBe(true);
            expect(matchesFilter({ v: "x" }, { v: { $type: "objectId" } })).toBe(false);
            expect(matchesFilter({ v: [1, "x"] }, { v: { $type: "string" } })).toBe(true);
            expect(matchesFilter({}, { v: { $type: "string" } })).toBe(false);
        });

        test("$type rejects type names it does not know", () => {
            expect(() => matchesFilter({ v: 1 }, { v: { $type: "decimal" } })).toThrow("unsupported $type decimal");
        });

        test("$not negates a condition", () => {
            expect(matchesFilter({ n: 5 }, { n: { $not: { $gt: 10 } } })).toBe(true);
            expect(matchesFilter({ n: 50 }, { n: { $not: { $gt: 10 } } })).toBe(false);
        });
    });

    describe("logical operators", () => {
        test("$and requires all clauses", () => {
            expect(matchesFilter({ a: 1, b: 2 }, { $and: [{ a: 1 }, { b: 2 }] })).toBe(true);
            expect(matchesFilter({ a: 1, b: 2 }, { $and: [{ a: 1 }, { b: 3 }] })).toBe(false);
        });

        test("$or requires any clause", () => {
            expect(matchesFilter({ a: 1 }, { $or: [{ a: 2 }, { a: 1 }] })).toBe(true);
            expect(matchesFilter({ a: 1 }, { $or: [{ a: 2 }, { a: 3 }] })).toBe(false);
        });

        test("$nor requires no clause", () => {
            expect(matchesFilter({ a: 1 }, { $nor: [{ a: 2 }, { a: 3 }] })).toBe(true);
            expect(matchesFilter({ a: 1 }, { $nor: [{ a: 1 }] })).toBe(false);
        });

        test("nests logical operators alongside field conditions", () => {
            const filter = { kind: "x", $or: [{ a: 1 }, { $and: [{ b: 2 }, { c: 3 }] }] };
            expect(matchesFilter({ kind: "x", b: 2, c: 3 }, filter)).toBe(true);
            expect(matchesFilter({ kind: "y", a: 1 }, filter)).toBe(false);
        });
    });

    test("throws on operators it does not implement", () => {
        expect(() => matchesFilter({ a: 1 }, { a: { $bitsAllSet: 1 } })).toThrow(
            "unsupported query operator $bitsAllSet",
        );
        expect(() => matchesFilter({ a: 1 }, { $expr: { $eq: ["$a", 1] } })).toThrow(
            "unsupported top-level operator $expr",
        );
    });
});

describe("FakeCollection reads", () => {
    const people = () =>
        collectionOf(
            { n: "carol", age: 30, tags: ["x"] },
            { n: "alice", age: 25 },
            { n: "bob", age: 35, nested: { city: "Malmo", street: "Main" } },
        );

    test("assigns an ObjectId to seeded documents that lack an _id", () => {
        for (const doc of people().docs) {
            expect(doc._id).toBeInstanceOf(ObjectId);
        }
    });

    test("keeps a provided _id", () => {
        const id = new ObjectId();
        expect(id.equals(collectionOf({ _id: id }).docs[0]._id)).toBe(true);
    });

    test("does not alias the seed documents", () => {
        const seed = { n: "a", nested: { x: 1 } };
        const collection = collectionOf(seed);
        seed.nested.x = 2;
        expect(collection.docs[0].nested.x).toBe(1);
    });

    test("findOne returns the first match or null", async () => {
        const collection = people();
        expect((await collection.findOne({ age: { $gt: 26 } }))?.n).toBe("carol");
        expect(await collection.findOne({ n: "nobody" })).toBeNull();
    });

    test("findOne returns a copy that does not affect stored state", async () => {
        const collection = people();
        const found = await collection.findOne({ n: "alice" });
        found!.age = 99;
        expect((await collection.findOne({ n: "alice" }))?.age).toBe(25);
    });

    test("findOne honors sort and projection options", async () => {
        const collection = people();
        expect(await collection.findOne({}, { sort: { age: -1 }, projection: { n: 1, _id: 0 } })).toEqual({ n: "bob" });
    });

    test("find returns every match in insertion order by default", async () => {
        expect(await ids(people())).toEqual(["carol", "alice", "bob"]);
    });

    test("find supports sort, skip and limit", async () => {
        const collection = people();
        expect((await collection.find().sort({ age: 1 }).toArray()).map((d) => d.n)).toEqual(["alice", "carol", "bob"]);
        expect((await collection.find().sort({ age: -1 }).limit(2).toArray()).map((d) => d.n)).toEqual(["bob", "carol"]);
        expect((await collection.find().sort({ age: 1 }).skip(1).limit(1).toArray()).map((d) => d.n)).toEqual(["carol"]);
    });

    test("find sorts booleans false before true, and missing values before everything else", async () => {
        const collection = collectionOf({ n: "yes", flag: true }, { n: "no", flag: false }, { n: "unset" });

        expect((await collection.find().sort({ flag: 1 }).toArray()).map((d) => d.n)).toEqual(["unset", "no", "yes"]);
        expect((await collection.find().sort({ flag: -1 }).toArray()).map((d) => d.n)).toEqual(["yes", "no", "unset"]);
    });

    test("find sorts by a boolean first and then by another key", async () => {
        const collection = collectionOf(
            { n: "a", pinned: false, at: 3 },
            { n: "b", pinned: true, at: 1 },
            { n: "c", pinned: false, at: 5 },
            { n: "d", pinned: true, at: 2 },
        );

        expect((await collection.find().sort({ pinned: -1, at: -1 }).toArray()).map((d) => d.n)).toEqual(["d", "b", "c", "a"]);
    });

    test("find sorts by multiple keys and nested paths", async () => {
        const collection = collectionOf(
            { n: "a", g: 1, nested: { v: 2 } },
            { n: "b", g: 1, nested: { v: 1 } },
            { n: "c", g: 0, nested: { v: 3 } },
        );
        expect((await collection.find().sort({ g: 1, "nested.v": 1 }).toArray()).map((d) => d.n)).toEqual(["c", "b", "a"]);
    });

    test("find accepts sort, limit and projection as options", async () => {
        const docs = await people().find({}, { sort: { age: 1 }, limit: 1, projection: { n: 1 } }).toArray();
        expect(docs).toHaveLength(1);
        expect(docs[0].n).toBe("alice");
        expect(docs[0].age).toBeUndefined();
    });

    test("projection includes only the requested fields plus _id", async () => {
        const [doc] = await people().find({ n: "bob" }).project({ n: 1, "nested.city": 1 }).toArray();
        expect(Object.keys(doc).sort()).toEqual(["_id", "n", "nested"]);
        expect(doc.nested).toEqual({ city: "Malmo" });
    });

    test("projection can drop _id or exclude fields", async () => {
        const [included] = await people().find({ n: "bob" }).project({ n: 1, _id: 0 }).toArray();
        expect(included).toEqual({ n: "bob" });

        const [excluded] = await people().find({ n: "bob" }).project({ age: 0, nested: 0 }).toArray();
        expect(Object.keys(excluded).sort()).toEqual(["_id", "n"]);
    });

    test("cursors are async iterable and expose next()", async () => {
        const collection = people();
        const seen: string[] = [];
        for await (const doc of collection.find().sort({ age: 1 })) seen.push(doc.n);
        expect(seen).toEqual(["alice", "carol", "bob"]);
        expect((await collection.find().sort({ age: -1 }).next())?.n).toBe("bob");
        expect(await collection.find({ n: "nobody" }).next()).toBeNull();
    });

    test("byId returns the live stored document, whatever the type of its id", () => {
        const id = new ObjectId();
        const collection = collectionOf({ _id: id, n: "a" }, { _id: "custom-id", n: "b" });

        expect(collection.byId(id)?.n).toBe("a");
        expect(collection.byId(new ObjectId(id.toHexString()))?.n).toBe("a");
        expect(collection.byId("custom-id")?.n).toBe("b");
        expect(collection.byId(id)).toBe(collection.docs[0]);
    });

    test("byId is undefined for an unknown id and does not match an ObjectId by its string form", () => {
        const id = new ObjectId();
        const collection = collectionOf({ _id: id });

        expect(collection.byId(new ObjectId())).toBeUndefined();
        expect(collection.byId(id.toHexString())).toBeUndefined();
    });

    test("countDocuments counts matches", async () => {
        const collection = people();
        expect(await collection.countDocuments()).toBe(3);
        expect(await collection.countDocuments({ age: { $gte: 30 } })).toBe(2);
    });

    test("distinct returns unique values and flattens arrays", async () => {
        const collection = collectionOf({ t: ["a", "b"] }, { t: ["b", "c"] }, { t: "d" }, {});
        expect(await collection.distinct("t")).toEqual(["a", "b", "c", "d"]);
        expect(await collection.distinct("t", { t: "d" })).toEqual(["d"]);
    });
});

describe("FakeCollection writes", () => {
    test("insertOne stores a copy, assigns an id and reports it", async () => {
        const collection = collectionOf();
        const doc = { n: "a" };
        const result = await collection.insertOne(doc);

        expect(result.acknowledged).toBe(true);
        expect(result.insertedId).toBeInstanceOf(ObjectId);
        expect(collection.docs).toHaveLength(1);
        expect(collection.docs[0]).not.toBe(doc);
        expect(doc).toEqual({ n: "a" });
    });

    test("insertOne rejects a duplicate _id with a duplicate key error", async () => {
        const id = new ObjectId();
        const collection = collectionOf({ _id: id });
        const error = await collection.insertOne({ _id: id }).catch((e) => e);

        expect(error.code).toBe(11000);
        expect(collection.docs).toHaveLength(1);
    });

    test("insertMany inserts each document", async () => {
        const collection = collectionOf();
        const result = await collection.insertMany([{ n: "a" }, { n: "b" }]);

        expect(result.insertedCount).toBe(2);
        expect(collection.docs.map((d) => d.n)).toEqual(["a", "b"]);
    });

    describe("updateOne", () => {
        test("updates the first match and reports counts", async () => {
            const collection = collectionOf({ n: "a", v: 1 }, { n: "a", v: 1 });
            const result = await collection.updateOne({ n: "a" }, { $set: { v: 2 } });

            expect(result).toMatchObject({ matchedCount: 1, modifiedCount: 1, upsertedCount: 0 });
            expect(collection.docs.map((d) => d.v)).toEqual([2, 1]);
        });

        test("reports no modification when the update changes nothing", async () => {
            const collection = collectionOf({ n: "a", v: 1 });
            expect(await collection.updateOne({ n: "a" }, { $set: { v: 1 } })).toMatchObject({
                matchedCount: 1,
                modifiedCount: 0,
            });
        });

        test("does nothing without a match and without upsert", async () => {
            const collection = collectionOf();
            expect(await collection.updateOne({ n: "a" }, { $set: { v: 1 } })).toMatchObject({
                matchedCount: 0,
                upsertedCount: 0,
            });
            expect(collection.docs).toHaveLength(0);
        });

        test("upserts a document seeded from the filter equality conditions", async () => {
            const collection = collectionOf();
            const result = await collection.updateOne(
                { userDid: "did:a", n: { $gt: 1 }, "nested.k": 5 },
                { $set: { v: 1 }, $setOnInsert: { createdAt: 7 } },
                { upsert: true },
            );

            expect(result.upsertedCount).toBe(1);
            expect(result.upsertedId).toBeInstanceOf(ObjectId);
            expect(collection.docs[0]).toMatchObject({
                userDid: "did:a",
                nested: { k: 5 },
                v: 1,
                createdAt: 7,
            });
            expect(collection.docs[0].n).toBeUndefined();
        });

        test("applies $setOnInsert only when inserting", async () => {
            const collection = collectionOf({ n: "a" });
            await collection.updateOne({ n: "a" }, { $setOnInsert: { created: 1 } }, { upsert: true });
            expect(collection.docs[0].created).toBeUndefined();
        });

        test("rejects replacement-style update documents", async () => {
            await expect(collectionOf({ n: "a" }).updateOne({ n: "a" }, { v: 1 })).rejects.toThrow(
                "must consist of update operators",
            );
        });

        test("rejects unsupported update operators and positional paths", async () => {
            await expect(collectionOf({ n: "a" }).updateOne({ n: "a" }, { $rename: { a: "b" } })).rejects.toThrow(
                "unsupported update operator $rename",
            );
            await expect(
                collectionOf({ n: "a", l: [{ x: 1 }] }).updateOne({ n: "a" }, { $set: { "l.$.x": 2 } }),
            ).rejects.toThrow("positional update operators are not supported");
        });
    });

    describe("update operators", () => {
        const apply = async (doc: Doc, update: Doc) => {
            const collection = collectionOf(doc);
            await collection.updateOne({}, update);
            return collection.docs[0];
        };

        test("$set creates nested paths and copies values", async () => {
            const value = { a: 1 };
            const doc = await apply({}, { $set: { "x.y.z": value } });
            expect(doc.x.y.z).toEqual({ a: 1 });
            expect(doc.x.y.z).not.toBe(value);
        });

        test("$unset removes fields, including nested ones", async () => {
            const doc = await apply({ a: 1, b: { c: 2, d: 3 } }, { $unset: { a: "", "b.c": "" } });
            expect(doc.a).toBeUndefined();
            expect(doc.b).toEqual({ d: 3 });
        });

        test("$unset ignores paths that do not exist", async () => {
            const doc = await apply({ a: 1 }, { $unset: { "x.y": "" } });
            expect(doc.a).toBe(1);
        });

        test("$inc adds to numbers and initializes missing fields", async () => {
            const doc = await apply({ a: 1 }, { $inc: { a: 2, b: 5, "c.d": -1 } });
            expect(doc).toMatchObject({ a: 3, b: 5, c: { d: -1 } });
        });

        test("$min and $max keep the extreme value", async () => {
            const doc = await apply({ lo: 5, hi: 5 }, { $min: { lo: 3, fresh: 9 }, $max: { hi: 3, top: 1 } });
            expect(doc).toMatchObject({ lo: 3, hi: 5, fresh: 9, top: 1 });
        });

        test("$push appends, creating the array and supporting $each", async () => {
            const doc = await apply({ a: [1] }, { $push: { a: 2, b: { $each: [3, 4] } } });
            expect(doc).toMatchObject({ a: [1, 2], b: [3, 4] });
        });

        test("$addToSet only appends values that are not present", async () => {
            const id = new ObjectId();
            const doc = await apply(
                { a: [1, id], b: [{ k: 1 }] },
                { $addToSet: { a: { $each: [1, 2, new ObjectId(id.toHexString())] }, b: { k: 1 } } },
            );
            expect(doc.a).toHaveLength(3);
            expect(doc.a[2]).toBe(2);
            expect(doc.b).toEqual([{ k: 1 }]);
        });

        test("$pull removes by value, by document condition and by operator", async () => {
            const doc = await apply(
                { a: [1, 2, 3, 2], b: [{ k: 1 }, { k: 2 }], c: [1, 5, 9] },
                { $pull: { a: 2, b: { k: 1 }, c: { $gt: 4 } } },
            );
            expect(doc).toMatchObject({ a: [1, 3], b: [{ k: 2 }], c: [1] });
        });

        test("$pullAll removes every listed value", async () => {
            const doc = await apply({ a: [1, 2, 3, 2] }, { $pullAll: { a: [2, 3] } });
            expect(doc.a).toEqual([1]);
        });

        test("$pull and $pullAll leave non-array fields alone", async () => {
            const doc = await apply({ a: "x" }, { $pull: { a: "x" }, $pullAll: { a: ["x"] } });
            expect(doc.a).toBe("x");
        });

        test("$currentDate sets a date", async () => {
            const doc = await apply({}, { $currentDate: { at: true } });
            expect(doc.at).toBeInstanceOf(Date);
        });

        test("applies several operators in one update", async () => {
            const doc = await apply({ a: 1, gone: 1 }, { $set: { b: 2 }, $inc: { a: 1 }, $unset: { gone: "" } });
            expect(doc).toMatchObject({ a: 2, b: 2 });
            expect(doc.gone).toBeUndefined();
        });
    });

    test("updateMany updates every match and reports counts", async () => {
        const collection = collectionOf({ g: 1, v: 0 }, { g: 1, v: 0 }, { g: 2, v: 0 });
        const result = await collection.updateMany({ g: 1 }, { $inc: { v: 1 } });

        expect(result).toMatchObject({ matchedCount: 2, modifiedCount: 2 });
        expect(collection.docs.map((d) => d.v)).toEqual([1, 1, 0]);
    });

    test("updateMany can upsert when nothing matches", async () => {
        const collection = collectionOf();
        const result = await collection.updateMany({ g: 1 }, { $set: { v: 1 } }, { upsert: true });

        expect(result.upsertedCount).toBe(1);
        expect(collection.docs[0]).toMatchObject({ g: 1, v: 1 });
    });

    test("replaceOne swaps the document but keeps the _id", async () => {
        const collection = collectionOf({ n: "a", old: true });
        const originalId = collection.docs[0]._id;
        await collection.replaceOne({ n: "a" }, { n: "a", fresh: true });

        expect(collection.docs[0]).toEqual({ _id: originalId, n: "a", fresh: true });
    });

    test("replaceOne can upsert", async () => {
        const collection = collectionOf();
        const result = await collection.replaceOne({ n: "a" }, { n: "a" }, { upsert: true });
        expect(result.upsertedCount).toBe(1);
        expect(collection.docs).toHaveLength(1);
    });

    describe("findOneAndUpdate", () => {
        test("returns the document before the update by default", async () => {
            const collection = collectionOf({ n: "a", v: 1 });
            const result = await collection.findOneAndUpdate({ n: "a" }, { $set: { v: 2 } });

            expect(result?.v).toBe(1);
            expect(collection.docs[0].v).toBe(2);
        });

        test("returns the updated document when asked", async () => {
            const collection = collectionOf({ n: "a", v: 1 });
            expect((await collection.findOneAndUpdate({ n: "a" }, { $inc: { v: 1 } }, { returnDocument: "after" }))?.v).toBe(2);
        });

        test("returns null when nothing matches", async () => {
            expect(await collectionOf().findOneAndUpdate({ n: "a" }, { $set: { v: 1 } })).toBeNull();
        });

        test("is atomic: concurrent callers each observe their own increment", async () => {
            const collection = collectionOf({ n: "counter", v: 0 });

            const results = await Promise.all(
                Array.from({ length: 5 }, () => collection.findOneAndUpdate({ n: "counter" }, { $inc: { v: 1 } }, { returnDocument: "after" })),
            );

            expect(results.map((doc) => doc?.v).sort()).toEqual([1, 2, 3, 4, 5]);
        });

        test("returns the upserted document when asked", async () => {
            const collection = collectionOf();
            const result = await collection.findOneAndUpdate(
                { n: "a" },
                { $set: { v: 1 } },
                { upsert: true, returnDocument: "after" },
            );
            expect(result).toMatchObject({ n: "a", v: 1 });
        });
    });

    test("deleteOne removes only the first match", async () => {
        const collection = collectionOf({ g: 1 }, { g: 1 });
        expect(await collection.deleteOne({ g: 1 })).toEqual({ acknowledged: true, deletedCount: 1 });
        expect(collection.docs).toHaveLength(1);
        expect((await collectionOf().deleteOne({ g: 1 })).deletedCount).toBe(0);
    });

    test("deleteMany removes every match and everything without a filter", async () => {
        const collection = collectionOf({ g: 1 }, { g: 1 }, { g: 2 });
        expect((await collection.deleteMany({ g: 1 })).deletedCount).toBe(2);
        expect(collection.docs).toHaveLength(1);
        expect((await collection.deleteMany()).deletedCount).toBe(1);
        expect(collection.docs).toHaveLength(0);
    });

    test("createIndex resolves without side effects", async () => {
        await expect(collectionOf().createIndex()).resolves.toBe("fake_index");
    });
});

describe("FakeCollection aggregate", () => {
    test("fails loudly when no handler is configured", () => {
        expect(() => collectionOf().aggregate([{ $match: {} }])).toThrow("without an onAggregate handler");
    });

    test("returns handler results as copies and records the pipeline", async () => {
        const collection = collectionOf();
        const rows = [{ total: 3 }];
        collection.onAggregate = () => rows;
        const pipeline = [{ $match: { a: 1 } }, { $count: "total" }];

        const result = await collection.aggregate(pipeline).toArray();

        expect(result).toEqual(rows);
        expect(result[0]).not.toBe(rows[0]);
        expect(collection.aggregations).toEqual([pipeline]);
    });

    test("passes the pipeline and options to async handlers", async () => {
        const collection = collectionOf();
        const seen: unknown[] = [];
        collection.onAggregate = async (pipeline, options) => {
            seen.push(pipeline, options);
            return [];
        };

        await collection.aggregate([{ $match: {} }], { allowDiskUse: true }).toArray();

        expect(seen).toEqual([[{ $match: {} }], { allowDiskUse: true }]);
    });
});
