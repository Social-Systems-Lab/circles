// user creation and management

import { User } from "@/models/models";
import { Users } from "./db";

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
export const getUserPrivate = async (userDid: string): Promise<User> => {
    let user = await Users.findOne({ did: userDid }, { projection: { _id: 0 } }); // exclude _id from result
    if (!user) {
        throw new Error("User not found");
    }
    return user;
};
