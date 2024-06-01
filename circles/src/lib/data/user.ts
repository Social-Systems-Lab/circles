// user creation and management

import { User } from "@/models/models";
import { Users } from "./db";

export const getUser = async (userDid: string): Promise<User> => {
    let user = await Users.findOne({ did: userDid });
    if (!user) {
        throw new Error("User not found");
    }
    return user;
};
