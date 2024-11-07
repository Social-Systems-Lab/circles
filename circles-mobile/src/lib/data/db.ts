// db.ts
import Dexie, { type EntityTable } from "dexie";
import { Identity } from "./models";

const db = new Dexie("circles") as Dexie & {
    identities: EntityTable<Identity, "did">;
};

db.version(3).stores({
    identities: "&did, name, encrypted_key, salt, iv, public_key_jwk",
});

export { db };
