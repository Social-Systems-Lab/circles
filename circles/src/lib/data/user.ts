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
import { defaultUserGroupsForUser, getDefaultAccessRules, getDefaultModules } from "./constants";
import { SAFE_CIRCLE_PROJECTION, getCircleById } from "./circle"; // Added getCircleById import
import { getEnabledModules } from "../auth/client-auth";
import { getGroupedUserNotificationSettings } from "@/lib/actions/notificationSettings";
import { VerificationRequest } from "@/models/models";
import { db } from "./db";

export const getVerificationStatus = async (userDid: string): Promise<"verified" | "pending" | "unverified"> => {
    const user = await getUserByDid(userDid);
    if (user.isVerified) {
        return "verified";
    }

    const verificationCollection = db.collection<VerificationRequest>("verifications");
    const existingRequest = await verificationCollection.findOne({
        userDid: userDid,
        status: "pending",
    });

    if (existingRequest) {
        return "pending";
    }

    return "unverified";
};

export const getAllUsers = async (): Promise<Circle[]> => {
    let circles: Circle[] = await Circles.find(
        {
            circleType: "user",
            $or: [{ isVerified: true }, { isMember: true }],
        },
        {
            projection: {
                _id: 1,
                name: 1,
                handle: 1,
                picture: 1,
                did: 1,
            },
        },
    ).toArray();

    circles.forEach((circle: Circle) => {
        if (circle._id) {
            circle._id = circle._id.toString();
        }
    });
    return circles;
};

export const getUser = async (userDid: string): Promise<Circle> => {
    let user = (await Circles.findOne({ did: userDid }, { projection: SAFE_CIRCLE_PROJECTION })) as Circle;
    if (!user) {
        throw new Error("User not found");
    }
    if (user?._id) {
        user._id = user._id.toString();
    }
    return user;
};

export const getUserById = async (id: string): Promise<Circle> => {
    let user = (await Circles.findOne({ _id: new ObjectId(id) }, { projection: SAFE_CIRCLE_PROJECTION })) as Circle;
    if (user?._id) {
        user._id = user._id.toString();
    }
    return user;
};

export const getUserByDid = async (did: string): Promise<Circle> => {
    let user = (await Circles.findOne({ did }, { projection: SAFE_CIRCLE_PROJECTION })) as Circle;
    if (user?._id) {
        user._id = user._id.toString();
    }
    return user;
};

export const getPrivateUserByDid = async (did: string): Promise<Circle> => {
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
    isEmailVerified?: boolean,
    emailVerificationToken?: string,
    emailVerificationTokenExpiry?: Date,
): Circle => {
    let user: Circle = {
        did,
        publicKey,
        name,
        handle,
        type,
        email,
        isEmailVerified,
        emailVerificationToken,
        emailVerificationTokenExpiry,
        circleType: "user",
        description: "",
        picture: { url: "/images/default-user-picture.png" },
        userGroups: defaultUserGroupsForUser,
        accessRules: getDefaultAccessRules(),
        enabledModules: getDefaultModules("user"),
        questionnaire: [],
        isPublic: true,
    };
    return user;
};

export const getUserByHandle = async (handle: string): Promise<Circle> => {
    let user = (await Circles.findOne({ handle: handle }, { projection: SAFE_CIRCLE_PROJECTION })) as Circle;
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
                            did: 1,
                            handle: 1,
                            description: 1,
                            content: 1,
                            picture: 1,
                            mission: 1,
                            circleType: 1,
                            images: 1, // Added images field
                            location: 1,
                            parentCircleId: 1,
                            enabledModules: 1,
                            accessRules: 1,
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
                    did: "$circle.did",
                    handle: "$circle.handle",
                    description: "$circle.description",
                    content: "$circle.content",
                    picture: "$circle.picture",
                    images: "$circle.images", // Use images field
                    mission: "$circle.mission",
                    location: "$circle.location",
                    circleType: "$circle.circleType",
                    parentCircleId: "$circle.parentCircleId",
                    enabledModules: "$circle.enabledModules",
                    accessRules: "$circle.accessRules", // Include access rules
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

        // Convert chatRoomId and circleId to ObjectId if present
        {
            $addFields: {
                chatRoomIdObject: { $toObjectId: "$chatRoomId" },
                circleIdObject: {
                    $cond: { if: { $eq: ["$circleId", null] }, then: null, else: { $toObjectId: "$circleId" } },
                },
            },
        },

        // Lookup the chat room
        {
            $lookup: {
                from: "chatRooms",
                localField: "chatRoomIdObject",
                foreignField: "_id",
                as: "chatRoom",
            },
        },
        { $unwind: "$chatRoom" },

        // Extract the ID of the other participant in a DM
        {
            $addFields: {
                otherParticipantId: {
                    $cond: {
                        if: "$chatRoom.isDirect",
                        then: {
                            $arrayElemAt: [
                                {
                                    $filter: {
                                        input: "$chatRoom.dmParticipants",
                                        as: "participant",
                                        cond: { $ne: ["$$participant", user._id] },
                                    },
                                },
                                0,
                            ],
                        },
                        else: null,
                    },
                },
            },
        },

        // 🔹 Convert `otherParticipantId` to ObjectId (only if it's not null)
        {
            $addFields: {
                otherParticipantIdObject: {
                    $cond: {
                        if: { $eq: ["$otherParticipantId", null] },
                        then: null,
                        else: { $toObjectId: "$otherParticipantId" },
                    },
                },
            },
        },

        // 🔹 Lookup the correct `circle`
        {
            $lookup: {
                from: "circles",
                let: {
                    circleId: "$circleIdObject",
                    otherParticipantId: "$otherParticipantIdObject",
                    isDirect: "$chatRoom.isDirect",
                },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $cond: {
                                    if: "$$isDirect",
                                    then: { $eq: ["$_id", "$$otherParticipantId"] }, // Lookup participant if DM
                                    else: { $eq: ["$_id", "$$circleId"] }, // Lookup group if not DM
                                },
                            },
                        },
                    },
                ],
                as: "circle",
            },
        },

        {
            $addFields: {
                circle: { $arrayElemAt: ["$circle", 0] }, // Convert from array to object
            },
        },

        // Final Projection
        {
            $project: {
                _id: { $toString: "$_id" },
                userDid: 1,
                chatRoomId: 1,
                circleId: 1,
                joinedAt: 1,
                chatRoom: {
                    _id: { $toString: "$chatRoom._id" },
                    name: "$circle.name", // Always use `circle.name`, whether user or group
                    handle: "$circle.handle",
                    circleId: "$chatRoom.circleId",
                    createdAt: "$chatRoom.createdAt",
                    userGroups: "$chatRoom.userGroups",
                    matrixRoomId: "$chatRoom.matrixRoomId",
                    picture: "$circle.picture", // Always use `circle.picture`, whether user or group
                    isDirect: "$chatRoom.isDirect",
                    dmParticipants: "$chatRoom.dmParticipants",
                    circle: {
                        _id: { $toString: "$circle._id" },
                        name: "$circle.name",
                        handle: "$circle.handle",
                        did: "$circle.did",
                        description: "$circle.description",
                        picture: "$circle.picture",
                        images: "$circle.images", // Use images field
                        mission: "$circle.mission",
                        location: "$circle.location",
                        circleType: "$circle.circleType",
                    },
                },
            },
        },
    ]).toArray();

    user.chatRoomMemberships = chatRoomMemberships as ChatRoomMembership[];

    // append matrix username details
    user.matrixUrl = process.env.NEXT_PUBLIC_MATRIX_URL;
    if (user.matrixUsername) {
        user.fullMatrixName = `@${user.matrixUsername}:${process.env.MATRIX_DOMAIN}`;
    }

    user.accessRules = getDefaultAccessRules();

    // Add notification settings
    const notificationSettingsResult = await getGroupedUserNotificationSettings(); // Assumes getGroupedUserNotificationSettings uses the authenticated user from its own context
    if ("error" in notificationSettingsResult) {
        console.error("Failed to fetch notification settings for user private data:", notificationSettingsResult.error);
        user.notificationSettings = undefined;
    } else {
        user.notificationSettings = notificationSettingsResult;
    }

    return user as UserPrivate;
};

// update user
export const updateUser = async (user: Partial<UserPrivate>, authenticatedUserDid: string): Promise<void> => {
    const { _id, ...userWithoutId } = user;
    if (!_id) {
        throw new Error("User ID (_id) is required for update");
    }

    // Fetch the existing user circle to check ownership
    const existingUserCircle = await getPrivateUserByDid(userWithoutId.did ?? ""); // Use did from update payload if available, otherwise fetch by _id first? Let's fetch by _id first for safety.
    const existingCircleById = await getCircleById(_id); // Fetch by ID first

    if (!existingCircleById) {
        throw new Error("User circle not found");
    }

    // Authorization check: Ensure it's a user circle and the authenticated user owns it
    if (existingCircleById.circleType !== "user") {
        throw new Error("Attempting to update a non-user circle via updateUser function.");
    }
    if (!authenticatedUserDid || existingCircleById.did !== authenticatedUserDid) {
        console.error(
            `Unauthorized attempt to update user circle via updateUser. Circle DID: ${existingCircleById.did}, Authenticated DID: ${authenticatedUserDid}`,
        );
        throw new Error("Unauthorized: Cannot update another user's profile.");
    }
    // Also ensure the DID in the payload matches, if provided, to prevent changing the DID via this route
    if (userWithoutId.did && userWithoutId.did !== authenticatedUserDid) {
        throw new Error("Unauthorized: Cannot change user DID via update.");
    }

    // Prevent other critical fields from being overwritten via this general update function
    delete userWithoutId.email; // Email should likely be updated via a separate, dedicated process if needed
    delete userWithoutId.circleType; // User circle type should not change

    // Proceed with the update
    let result = await Circles.updateOne({ _id: new ObjectId(_id) }, { $set: userWithoutId });
    if (result.matchedCount === 0) {
        // This should theoretically not happen due to the check above, but keep for safety
        throw new Error("User not found during update operation");
    }

    // Note: updateUser doesn't handle embedding updates like updateCircle does.
    // This might be intentional if user profile updates don't need embedding updates,
    // or it might be an oversight. Keeping it as is for now.
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

/**
 * Add a circle to the user's bookmarks.
 */
export const addBookmark = async (userDid: string, circleId: string): Promise<void> => {
    await Circles.updateOne(
        { did: userDid },
        {
            $addToSet: { bookmarkedCircles: circleId },
        },
    );
};

/**
 * Remove a circle from the user's bookmarks.
 */
export const removeBookmark = async (userDid: string, circleId: string): Promise<void> => {
    await Circles.updateOne(
        { did: userDid },
        {
            $pull: { bookmarkedCircles: circleId },
        },
    );
};

/**
 * Pin a circle for the user. Also ensures it's bookmarked. New pins are added to the front.
 * Caps total pins at 5.
 */
export const pinCircle = async (userDid: string, circleId: string): Promise<void> => {
    // Fetch current pinned list
    const user = await Circles.findOne(
        { did: userDid },
        { projection: { pinnedCircles: 1 } as any },
    );

    const current = Array.isArray((user as any)?.pinnedCircles) ? ((user as any).pinnedCircles as string[]) : [];
    const next = [circleId, ...current.filter((id) => id !== circleId)].slice(0, 5);

    await Circles.updateOne(
        { did: userDid },
        {
            $set: { pinnedCircles: next },
            $addToSet: { bookmarkedCircles: circleId },
        },
    );
};

/**
 * Unpin a circle for the user.
 */
export const unpinCircle = async (userDid: string, circleId: string): Promise<void> => {
    await Circles.updateOne(
        { did: userDid },
        {
            $pull: { pinnedCircles: circleId },
        },
    );
};
