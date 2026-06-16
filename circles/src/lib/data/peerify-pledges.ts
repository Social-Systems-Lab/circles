import { ObjectId } from "mongodb";
import { getDb } from "@/lib/data/db";
import type { Circle } from "@/models/models";
import type { PeerifyPledgeEnquiryInput } from "@/lib/peerify/artist-profile";

export type PeerifyPledgeRecord = {
    _id?: string;
    artistCircleId: string;
    artistHandle: string;
    artistName: string;
    pledgerDid: string;
    pledgerName: string;
    pledgerHandle: string;
    pledgerPicture?: string;
    fanLocation: string;
    maximumTicketAmount: string;
    preferredEventType: string;
    helpOptions: string[];
    note: string;
    createdAt: Date;
    updatedAt: Date;
};

export type PeerifyPledgeInput = {
    artist: Circle;
    pledger: Circle;
    pledge: PeerifyPledgeEnquiryInput;
};

const COLLECTION_NAME = "peerify_pledges";

const clampText = (value: unknown, maxLength: number): string => {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim().slice(0, maxLength);
};

const clampStringArray = (value: unknown, maxItems: number, maxItemLength: number): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => clampText(item, maxItemLength))
        .filter(Boolean)
        .slice(0, maxItems);
};

const getPledgeCollection = async () => {
    const db = await getDb();
    return db.collection<Omit<PeerifyPledgeRecord, "_id"> & { _id?: ObjectId }>(COLLECTION_NAME);
};

const mapPledgeRecord = (record: Omit<PeerifyPledgeRecord, "_id"> & { _id?: ObjectId }): PeerifyPledgeRecord => ({
    ...record,
    _id: record._id?.toString(),
});

export async function createPeerifyPledge(input: PeerifyPledgeInput): Promise<PeerifyPledgeRecord> {
    const now = new Date();
    const record: Omit<PeerifyPledgeRecord, "_id"> = {
        artistCircleId: String(input.artist._id || ""),
        artistHandle: clampText(input.artist.handle, 80),
        artistName: clampText(input.artist.name, 160),
        pledgerDid: clampText(input.pledger.did, 160),
        pledgerName: clampText(input.pledger.name, 160),
        pledgerHandle: clampText(input.pledger.handle, 80),
        pledgerPicture: clampText(input.pledger.picture?.url, 500) || undefined,
        fanLocation: clampText(input.pledge.fanLocation, 120),
        maximumTicketAmount: clampText(input.pledge.maximumTicketAmount, 80),
        preferredEventType: clampText(input.pledge.preferredEventType, 80),
        helpOptions: clampStringArray(input.pledge.helpOptions, 8, 80),
        note: clampText(input.pledge.note, 1000),
        createdAt: now,
        updatedAt: now,
    };

    const collection = await getPledgeCollection();
    const result = await collection.insertOne(record);

    return {
        ...record,
        _id: result.insertedId.toString(),
    };
}

export async function listPeerifyPledgesForArtist(artistCircleId: string): Promise<PeerifyPledgeRecord[]> {
    const collection = await getPledgeCollection();
    const records = await collection.find({ artistCircleId }).sort({ createdAt: -1 }).limit(500).toArray();

    return records.map(mapPledgeRecord);
}
