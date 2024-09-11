import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type CirclePictureProps = {
    name?: string;
    picture?: string;
    size?: string;
};

export const CirclePicture = ({ name, picture, size }: CirclePictureProps) => {
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
        <Avatar className="bg-white shadow-lg" style={size ? { width: size, height: size } : {}}>
            <AvatarImage src={picture} />
            <AvatarFallback>{getInitials()}</AvatarFallback>
        </Avatar>
    );
};
