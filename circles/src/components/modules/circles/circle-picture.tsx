import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useIsMobile } from "@/components/utils/use-is-mobile";
import { contentPreviewAtom, sidePanelContentVisibleAtom } from "@/lib/data/atoms";
import { cn } from "@/lib/utils";
import { Circle, ContentPreviewData } from "@/models/models";
import { useAtom } from "jotai";
import { useRouter } from "next/navigation";

type CirclePictureProps = {
    circle: Circle;
    size?: string;
    className?: string;
    openPreview?: boolean;
};

export const CirclePicture = ({ circle, size, className, openPreview }: CirclePictureProps) => {
    const [, setContentPreview] = useAtom(contentPreviewAtom);
    const [sidePanelContentVisible] = useAtom(sidePanelContentVisibleAtom);
    const isMobile = useIsMobile();
    const router = useRouter();

    // Don't render anything for projects - they should only show cover images
    if (circle?.circleType === "project") {
        return null;
    }

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

    const onOpenPreview = () => {
        // if (isMobile) {
        //     router.push(`/circles/${circle.handle}`);
        // }

        // Open preview
        let contentPreviewData: ContentPreviewData = {
            type: "user",
            content: circle,
        };
        setContentPreview((x) =>
            x?.content === circle && sidePanelContentVisible === "content" ? undefined : contentPreviewData,
        );
    };

    return (
        <div className={className}>
            <Avatar
                className={`bg-white shadow-lg ${openPreview ? "cursor-pointer" : ""}`}
                onClick={openPreview ? onOpenPreview : undefined}
                style={size ? { width: size, height: size } : {}}
            >
                <AvatarImage src={circle?.picture?.url} />
                <AvatarFallback>{getInitials()}</AvatarFallback>
            </Avatar>
        </div>
    );
};
