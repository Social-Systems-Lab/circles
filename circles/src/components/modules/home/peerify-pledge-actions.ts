"use server";

import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getCircleByDid, getCircleById } from "@/lib/data/circle";
import { createPeerifyPledge } from "@/lib/data/peerify-pledges";
import {
    isPeerifyArtistIdentity,
    isPeerifyManagedIdentity,
    type PeerifyPledgeEnquiryInput,
} from "@/lib/peerify/artist-profile";

export async function createPeerifyPledgeAction({
    artistCircleId,
    pledge,
}: {
    artistCircleId: string;
    pledge: PeerifyPledgeEnquiryInput;
}): Promise<{ success: boolean; message?: string; pledgeId?: string }> {
    const userDid = await getAuthenticatedUserDid();
    if (!userDid) {
        return { success: false, message: "You need to be logged in to pledge interest" };
    }

    if (!artistCircleId) {
        return { success: false, message: "Missing artist profile" };
    }

    const artist = await getCircleById(artistCircleId);
    if (!artist?._id) {
        return { success: false, message: "Artist profile not found" };
    }

    if (!isPeerifyArtistIdentity(artist) || !isPeerifyManagedIdentity(artist)) {
        return { success: false, message: "This profile is not accepting structured pledges yet" };
    }

    const pledger = await getCircleByDid(userDid);
    if (!pledger?._id || !pledger.did) {
        return { success: false, message: "Could not resolve your profile" };
    }

    if (!pledge?.fanLocation?.trim() && !pledge?.note?.trim()) {
        return { success: false, message: "Add at least your location or a note before pledging." };
    }

    const record = await createPeerifyPledge({ artist, pledger, pledge });

    return {
        success: true,
        pledgeId: record._id,
        message: "Thanks — your pledge has been added to this artist's support map.",
    };
}
