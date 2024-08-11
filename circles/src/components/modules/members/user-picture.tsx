import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type UserPictureProps = {
    name?: string;
    picture?: string;
    size?: string;
};

export const UserPicture = ({ name, picture, size }: UserPictureProps) => {
    var getInitials = () => {
        if (!name) return "";
        var names = name.split(" ");
        var initials = names[0].substring(0, 1).toUpperCase();

        if (names.length > 1) {
            initials += names[names.length - 1].substring(0, 1).toUpperCase();
        }
        return initials;
    };

    return (
        <Avatar style={size ? { width: size, height: size } : {}}>
            <AvatarImage src={picture ?? "/images/default-user-picture.png"} />
            <AvatarFallback>{getInitials()}</AvatarFallback>
        </Avatar>
    );
};
