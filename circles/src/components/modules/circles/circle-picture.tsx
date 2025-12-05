"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { contentPreviewAtom, sidePanelContentVisibleAtom } from "@/lib/data/atoms";
import { cn } from "@/lib/utils";
import { Circle, ContentPreviewData, FileInfo, CircleType } from "@/models/models"; // Import needed types
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";
import CircleTypeIndicator from "@/components/utils/circle-type-indicator";
import { convertMxcToHttp } from "@/lib/utils/matrix-utils";

// Define a more flexible type for the prop
interface CircleLike {
    _id?: any;
    name?: string;
    picture?: FileInfo;
    handle?: string;
    circleType?: CircleType;
}

type CirclePictureProps = {
    circle: CircleLike; // Use the flexible type
    size?: string;
    className?: string;
    openPreview?: boolean;
    showTypeIndicator?: boolean;
};

export const CirclePicture = ({
    circle,
    size,
    className,
    openPreview,
    showTypeIndicator = false,
}: CirclePictureProps) => {
    const [, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const isMobile = useIsMobile();
    const router = useRouter();

    var getInitials = () => {
        let name = circle?.name;
        if (!name) return "";
        var names = name.split(" ");
        var initials = names[0].substring(0, 1).toUpperCase();

        if (names.length > 1) {
            initials += names[names.length - 1].substring(0, 1).toUpperCase();
        }
        return initials;
    };

    const onOpenPreview = (e: React.MouseEvent) => {
        if (isMobile) {
            router.push(`/circle/${circle?.handle}`);
            return;
        }

        // Open preview
        // Cast back to Circle if ContentPreviewData requires the full type
        let contentPreviewData: ContentPreviewData = {
            type: "user", // Assuming preview is for user/circle types mainly
            content: circle as Circle,
        };
        setContentPreview(
            (x) =>
                x?.content?._id === circle._id && sidePanelContentVisible === "content"
                    ? undefined
                    : contentPreviewData, // Compare by _id
        );
        e.stopPropagation();
    };

    return (
        <div className={className}>
            <Avatar
                className={`bg-white shadow-lg ${openPreview ? "cursor-pointer" : ""}`}
                onClick={openPreview ? onOpenPreview : undefined}
                style={size ? { width: size, height: size } : {}}
            >
                <AvatarImage src={convertMxcToHttp(
                    typeof circle?.picture === 'string' 
                        ? circle.picture 
                        : circle?.picture?.url
                )} />
                <AvatarFallback>{getInitials()}</AvatarFallback>
            </Avatar>

            {/* Only show type indicators in chat list */}
            {showTypeIndicator && (
                <div
                    style={{
                        position: "absolute",
                        right: "-5px",
                        bottom: "-5px",
                        zIndex: 10,
                    }}
                >
                    <CircleTypeIndicator
                        circleType={circle?.circleType || "circle"}
                        size={`${parseInt(size || "40") / 2.5}px`}
                    />
                </div>
            )}
        </div>
    );
};
