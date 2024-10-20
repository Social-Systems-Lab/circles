import {
    Circle,
    MemberDisplay,
    UserPrivate,
    Content,
    Media,
    ContentPreviewData,
    PostDisplay,
    UserToolboxState,
} from "@/models/models";
import { atom } from "jotai";

export const userAtom = atom<UserPrivate | undefined>(undefined);
export const authenticatedAtom = atom<boolean | undefined>(undefined);
export const triggerMapOpenAtom = atom<boolean>(false);
export const mapOpenAtom = atom<boolean>(false);
export const mapboxKeyAtom = atom<string>("");
export const displayedContentAtom = atom<Content[]>([]);
export const zoomContentAtom = atom<Content | undefined>(undefined);
export const contentPreviewAtom = atom<ContentPreviewData | undefined>(undefined);
export const userToolboxStateAtom = atom<UserToolboxState>(undefined);
export const sidePanelContentVisibleAtom = atom<"content" | "toolbox" | undefined>();
export const focusPostAtom = atom<PostDisplay | undefined>(undefined);
export const imageGalleryAtom = atom<{ images: Media[]; initialIndex: number } | null>(null);
