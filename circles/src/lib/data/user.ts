// user creation and management

import { AccountType, Membership, RegistryInfo, User, UserPrivate } from "@/models/models";
import { Members, Users } from "./db";
import { ObjectId } from "mongodb";
import { signRegisterUserChallenge } from "../auth/auth";
import { getUserPendingMembershipRequests } from "./membership-requests";

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

    // add pending membership requests
    let pendingRequests = await getUserPendingMembershipRequests(userDid);
    user.pendingRequests = pendingRequests;
    return user as UserPrivate;
};

// update user
export const updateUser = async (user: Partial<UserPrivate>): Promise<void> => {
    let { _id, ...userWithoutId } = user;
    let result = await Users.updateOne({ _id: new ObjectId(_id) }, { $set: userWithoutId });
    if (result.matchedCount === 0) {
        throw new Error("User not found");
    }
};

// registers a user in the circles registry
export const registerUser = async (
    did: string,
    name: string,
    email: string,
    password: string,
    handle: string,
    type: AccountType,
    homeServerDid: string,
    registryUrl: string,
    publicKey: string,
    picture?: string,
): Promise<RegistryInfo> => {
    if (!did || !name || !homeServerDid || !registryUrl || !publicKey) {
        throw new Error("Invalid server registration data");
    }

    // make a register request to the registry
    let registerResponse = await fetch(`${registryUrl}/users/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ did, name, email, type, handle, homeServerDid, picture, publicKey }),
        cache: "no-store",
    });

    let registerData = await registerResponse.json();
    if (registerResponse.status !== 200) {
        console.log("Failed to register user", registerData);
        throw new Error("Failed to register user");
    }

    // sign the challenge
    console.log("Received register response", registerData);
    const signature = signRegisterUserChallenge(did, password, registerData.challenge);

    // confirm registration
    let confirmResponse = await fetch(`${registryUrl}/users/register-confirm`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ did, challenge: registerData.challenge, signature }),
        cache: "no-store",
    });

    let confirmResponseObject = await confirmResponse.json();

    if (confirmResponse.status !== 200) {
        console.log("Failed to confirm registration", confirmResponseObject);
        throw new Error("Failed to confirm registration");
    }

    if (!confirmResponseObject.success) {
        console.log("Failed to confirm registration", confirmResponseObject);
        throw new Error("Failed to confirm registration");
    }

    let registryInfo: RegistryInfo = {
        registryUrl,
        registeredAt: new Date(),
    };
    console.log("Received confirm response", confirmResponseObject);
    return registryInfo;
};
