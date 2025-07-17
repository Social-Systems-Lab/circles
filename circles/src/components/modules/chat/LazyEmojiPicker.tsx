"use client";

import dynamic from "next/dynamic";
import { EmojiClickData } from "emoji-picker-react";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface LazyEmojiPickerProps {
    onEmojiClick: (emojiData: EmojiClickData) => void;
}

const LazyEmojiPicker: React.FC<LazyEmojiPickerProps> = ({ onEmojiClick }) => {
    return <EmojiPicker onEmojiClick={onEmojiClick} />;
};

export default LazyEmojiPicker;
