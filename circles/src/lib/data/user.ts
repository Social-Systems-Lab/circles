// user.ts - user creation and management
import {
    AccountType,
    Challenge,
    ChatRoomMembership,
    Circle,
    Membership,
    RegistryInfo,
    UserPrivate,
} from "@/models/models";
import { Challenges, ChatRoomMembers, Circles, Members } from "./db";
import { ObjectId } from "mongodb";
import { signRegisterUserChallenge } from "../auth/auth";
import { getUserPendingMembershipRequests } from "./membership-requests";
import { defaultPagesForUser, defaultUserGroupsForUser, getDefaultAccessRulesForUser } from "./constants";

export const getUser = async (userDid: string): Promise<Circle> => {
    let user = await Circles.findOne(
        { did: userDid },
        { projection: { did: 1, type: 1, handle: 1, name: 1, picture: 1, cover: 1, mission: 1, location: 1 } },
    );
    if (!user) {
        throw new Error("User not found");
    }
    return user;
};

export const getUserById = async (id: string): Promise<Circle> => {
    let user = (await Circles.findOne({ _id: new ObjectId(id) })) as Circle;
    if (user?._id) {
        user._id = user._id.toString();
    }
    return user;
};

export const getUserByDid = async (did: string): Promise<Circle> => {
    let user = (await Circles.findOne({ did })) as Circle;
    if (user?._id) {
        user._id = user._id.toString();
    }
    return user;
};

export const createNewUser = (
    did: string,
    publicKey: string,
    name?: string,
    handle?: string,
    type?: AccountType,
    email?: string,
): Circle => {
    let user: Circle = {
        did,
        publicKey,
        name,
        handle,
        type,
        email,
        circleType: "user",
        description: "",
        picture: { url: "/images/default-user-picture.png" },
        cover: { url: "/images/default-user-cover.png" },
        userGroups: defaultUserGroupsForUser,
        accessRules: getDefaultAccessRulesForUser(),
        pages: defaultPagesForUser,
        questionnaire: [],
        isPublic: false,
    };
    return user;
};

export const getUserByHandle = async (handle: string): Promise<Circle> => {
    let user = (await Circles.findOne({ handle: handle })) as Circle;
    if (user?._id) {
        user._id = user._id.toString();
    }
    return user;
};

// gets the user including private information that should only be returned to the user
export const getUserPrivate = async (userDid: string): Promise<UserPrivate> => {
    let user = (await Circles.findOne({ did: userDid })) as UserPrivate;
    if (!user) {
        throw new Error("User not found");
    }
    user._id = user?._id?.toString();

    // add user circle memberships
    let memberships = await Members.aggregate([
        { $match: { userDid: userDid } },
        {
            $lookup: {
                from: "circles",
                let: { circle_id: { $toObjectId: "$circleId" } },
                pipeline: [
                    { $match: { $expr: { $eq: ["$_id", "$$circle_id"] } } },
                    {
                        $project: {
                            name: 1,
                            handle: 1,
                            description: 1,
                            picture: 1,
                            cover: 1,
                            circleType: 1,
                            mission: 1,
                            location: 1,
                        },
                    },
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
                    mission: "$circle.mission",
                    location: "$circle.location",
                    circleType: "$circle.circleType",
                },
            },
        },
    ]).toArray();
    user.memberships = memberships as Membership[];

    // add pending membership requests
    let pendingRequests = await getUserPendingMembershipRequests(userDid);
    user.pendingRequests = pendingRequests;

    // add chat room memberships
    let chatRoomMemberships = await ChatRoomMembers.aggregate([
        { $match: { userDid: userDid } },
        // Convert chatRoomId to ObjectId
        {
            $addFields: {
                chatRoomIdObject: { $toObjectId: "$chatRoomId" },
            },
        },
        {
            $lookup: {
                from: "chatRooms",
                localField: "chatRoomIdObject",
                foreignField: "_id",
                as: "chatRoom",
            },
        },
        { $unwind: "$chatRoom" },
        {
            $project: {
                _id: { $toString: "$_id" },
                userDid: 1,
                chatRoomId: 1,
                circleId: 1,
                joinedAt: 1,
                chatRoom: {
                    _id: { $toString: "$chatRoom._id" },
                    name: "$chatRoom.name",
                    handle: "$chatRoom.handle",
                    circleId: "$chatRoom.circleId",
                    createdAt: "$chatRoom.createdAt",
                    userGroups: "$chatRoom.userGroups",
                    matrixRoomId: "$chatRoom.matrixRoomId",
                },
            },
        },
    ]).toArray();

    user.chatRoomMemberships = chatRoomMemberships as ChatRoomMembership[];

    return user as UserPrivate;
};

// update user
export const updateUser = async (user: Partial<UserPrivate>): Promise<void> => {
    let { _id, ...userWithoutId } = user;
    let result = await Circles.updateOne({ _id: new ObjectId(_id) }, { $set: userWithoutId });
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
        throw new Error("Failed to register user");
    }

    // sign the challenge
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
        throw new Error("Failed to confirm registration");
    }

    if (!confirmResponseObject.success) {
        throw new Error("Failed to confirm registration");
    }

    let registryInfo: RegistryInfo = {
        registryUrl,
        registeredAt: new Date(),
    };
    return registryInfo;
};

export const getUsersByMatrixUsernames = async (usernames: string[]): Promise<Circle[]> => {
    if (usernames.length === 0) {
        return [];
    }

    // Query the database for matching users
    const users = await Circles.find(
        { matrixUsername: { $in: usernames } },
        {
            projection: {
                _id: 1,
                did: 1,
                name: 1,
                picture: 1,
                handle: 1,
                description: 1,
                matrixUsername: 1,
            },
        },
    ).toArray();

    // Convert ObjectId to string for `_id`
    return users.map((user) => ({
        ...user,
        _id: user._id?.toString(),
    })) as Circle[];
};
