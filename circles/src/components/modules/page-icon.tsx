"use client";

import {
    AiOutlineAppstore,
    AiOutlineContacts,
    AiOutlineHome,
    AiOutlineQuestion,
    AiOutlineSetting,
    AiOutlineUnorderedList,
    AiOutlineWifi,
} from "react-icons/ai";
import { FaRegCircle } from "react-icons/fa6";
import { IoChatbubbleOutline } from "react-icons/io5";

type PageIconProps = {
    module: string;
    size: string;
};

export const PageIcon = ({ module, size }: PageIconProps) => {
    switch (module) {
        case "pages":
            return <AiOutlineAppstore size={size} />;
        case "home":
            return <AiOutlineHome size={size} />;
        case "settings":
            return <AiOutlineSetting size={size} />;
        case "members":
            return <AiOutlineContacts size={size} />;
        case "circles":
            return <FaRegCircle size={size} />;
        case "feeds":
            return <AiOutlineWifi size={size} />;
        case "chat":
            return <IoChatbubbleOutline size={size} />;
        default:
            return <AiOutlineQuestion size={size} />;
    }
};

export default PageIcon;
