import { Circle, MemberDisplay, UserPrivate } from "@/models/models";
import { atom } from "jotai";

export const userAtom = atom<UserPrivate | undefined>(undefined);
export const authenticatedAtom = atom<boolean | undefined>(undefined);
export const mapOpenAtom = atom<boolean>(false);
export const mapboxKeyAtom = atom<string>("");
export const displayedContentAtom = atom<(Circle | MemberDisplay)[]>([]);
