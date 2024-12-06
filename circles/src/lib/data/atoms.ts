import {
    Circle,
    MemberDisplay,
    UserPrivate,
    Content,
    Media,
    ContentPreviewData,
    PostDisplay,
    UserToolboxData,
    AuthInfo,
    MatrixUserCache,
} from "@/models/models";
import { atom } from "jotai";

export const userAtom = atom<UserPrivate | undefined>(undefined);

export const authInfoAtom = atom<AuthInfo>({ authStatus: "loading", inSsiApp: false });
export const triggerMapOpenAtom = atom<boolean>(false);
export const mapOpenAtom = atom<boolean>(false);
export const mapboxKeyAtom = atom<string>("");
export const displayedContentAtom = atom<Content[]>([]);
export const zoomContentAtom = atom<Content | undefined>(undefined);
export const contentPreviewAtom = atom<ContentPreviewData | undefined>(undefined);
export const userToolboxDataAtom = atom<UserToolboxData | undefined>(undefined);
export const sidePanelContentVisibleAtom = atom<"content" | "toolbox" | undefined>(undefined);
export const focusPostAtom = atom<PostDisplay | undefined>(undefined);
export const imageGalleryAtom = atom<{ images: Media[]; initialIndex: number } | null>(null);
export const matrixUserCacheAtom = atom<MatrixUserCache>({});
