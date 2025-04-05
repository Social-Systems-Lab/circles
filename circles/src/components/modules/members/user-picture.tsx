import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MouseEventHandler } from "react";
import { Circle } from "@/models/models";

type UserPictureProps = {
    name?: string;
    picture?: string;
    size?: string;
    onClick?: MouseEventHandler<HTMLDivElement> | undefined;
    circleType?: "user" | "circle" | "project";
    cover?: string; // For projects, use cover image instead of profile picture
};

export const UserPicture = ({ name, picture, size, onClick, circleType, cover }: UserPictureProps) => {
    var getInitials = () => {
        if (!name) return "";
        var names = name.split(" ");
        var initials = names[0].substring(0, 1).toUpperCase();

        if (names.length > 1) {
            initials += names[names.length - 1].substring(0, 1).toUpperCase();
        }
        return initials;
    };

    // For projects, use the cover image instead of profile picture
    const imageSource = picture ?? "/images/default-user-picture.png";

    return (
        <Avatar
            style={size ? { width: size, height: size } : {}}
            onClick={onClick}
            className={`${onClick ? "cursor-pointer" : ""} ${circleType === "project" ? "overflow-hidden" : ""}`}
        >
            <AvatarImage src={imageSource} />
            <AvatarFallback>{getInitials()}</AvatarFallback>
        </Avatar>
    );
};
