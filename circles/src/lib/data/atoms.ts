import { User } from "@/models/models";
import { atom } from "jotai";

export const userAtom = atom<User | undefined>(undefined);
export const authenticatedAtom = atom<boolean | undefined>(undefined);
