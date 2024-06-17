// user creation and management

import { Membership, User, UserPrivate } from "@/models/models";
import { Members, Users } from "./db";
import { pipeline } from "stream";

export const getUser = async (userDid: string): Promise<User> => {
    let user = await Users.findOne(
        { did: userDid },
        { projection: { did: 1, type: 1, handle: 1, name: 1, picture: 1, cover: 1 } },
    );
    if (!user) {
        throw new Error("User not found");
    }
    return user;
};

// gets the user including private information that should only be returned to the user
export const getUserPrivate = async (userDid: string): Promise<UserPrivate> => {
    let user = (await Users.findOne({ did: userDid })) as UserPrivate;
    if (!user) {
        throw new Error("User not found");
    }
    user._id = user?._id?.toString();

    // add user memberships
    let memberships = await Members.aggregate([
        { $match: { userDid: userDid } },
        {
            $lookup: {
                from: "circles",
                let: { circle_id: { $toObjectId: "$circleId" } },
                pipeline: [
                    { $match: { $expr: { $eq: ["$_id", "$$circle_id"] } } },
                    { $project: { name: 1, handle: 1, description: 1, picture: 1, cover: 1 } },
                ],
                as: "circle",
            },
        },
        { $unwind: "$circle" },
        {
            $project: {
                _id: 0,
                circleId: 1,
                userGroups: 1,
                joinedAt: 1,
                circle: {
                    _id: { $toString: "$circle._id" },
                    name: "$circle.name",
                    handle: "$circle.handle",
                    description: "$circle.description",
                    picture: "$circle.picture",
                    cover: "$circle.cover",
                },
            },
        },
    ]).toArray();
    user.memberships = memberships as Membership[];

    return user as UserPrivate;
};
