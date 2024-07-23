"use client";

import { Page } from "@/models/models";
import { AiOutlineContacts, AiOutlineHome, AiOutlineQuestion, AiOutlineSetting } from "react-icons/ai";

type PageIconProps = {
    page: Page;
    size: string;
};

export const PageIcon = ({ page, size }: PageIconProps) => {
    switch (page?.module) {
        case "home":
            return <AiOutlineHome size={size} />;
        case "settings":
            return <AiOutlineSetting size={size} />;
        case "members":
            return <AiOutlineContacts size={size} />;
        default:
            return <AiOutlineQuestion size={size} />;
    }
};

export default PageIcon;
