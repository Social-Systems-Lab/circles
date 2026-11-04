import { ObjectId } from "mongodb";
import type { Member } from "@/models/models";
import { addChatRoomMember, getChatRoomByHandle } from "./chat";
import { Circles, Members } from "./db";
import { addMember } from "./member";

export async function reconcileSecretInvitationMembership(userDid: string, circleId: string): Promise<Member> {
    let membership = await Members.findOne({ userDid, circleId });
    if (!membership) {
        await addMember(userDid, circleId, ["members"]);
        membership = await Members.findOne({ userDid, circleId });
    }
    if (!membership) throw new Error("Canonical membership was not created");

    const membersChat = await getChatRoomByHandle(circleId, "members");
    if (membersChat?._id) await addChatRoomMember(userDid, membersChat._id);

    const canonicalMemberCount = await Members.countDocuments({ circleId });
    const countResult = await Circles.updateOne(
        { _id: new ObjectId(circleId) },
        { $set: { members: canonicalMemberCount } },
    );
    if (countResult.matchedCount !== 1) throw new Error("Circle member count could not be reconciled");
    return membership;
}
