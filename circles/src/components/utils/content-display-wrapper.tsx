"use client";

import React, { useEffect } from "react";
import { useAtom } from "jotai";
import { displayedContentAtom } from "@/lib/data/atoms";
import { Content } from "@/models/models";

interface ContentDisplayWrapperProps {
    content: Content[];
    children: React.ReactNode;
}

const ContentDisplayWrapper: React.FC<ContentDisplayWrapperProps> = ({ content, children }) => {
    const [, setDisplayedContent] = useAtom(displayedContentAtom);

    useEffect(() => {
        //setting displayed content
        // console.log(
        //     "setting displayed content",
        //     content.filter((item) => item?.location?.lngLat),
        // );
        setDisplayedContent(content);
    }, [content, setDisplayedContent]);

    return <>{children}</>;
};

export default ContentDisplayWrapper;
