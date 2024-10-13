import { useIsCompact } from "@/components/utils/use-is-compact";
import { Circle, Page } from "@/models/models";
import { ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback } from "react";

type CircleHeaderProps = {
    circle: Circle;
    page?: Page;
    subpage?: string;
    isDefaultCircle?: boolean;
};

export const CircleHeader: React.FC<CircleHeaderProps> = ({ circle, page, subpage, isDefaultCircle }) => {
    const isCompact = useIsCompact();

    const getPath = useCallback(
        (page?: Page) => {
            let pageHandle = page?.handle ?? "";

            if (isDefaultCircle) {
                return `/${pageHandle}`;
            } else {
                return `/circles/${circle.handle}${pageHandle ? `/${pageHandle}` : ""}`;
            }
        },
        [isDefaultCircle, circle.handle],
    );

    if (isCompact) {
        return <div></div>;
    }

    return (
        <div className="mb-4 flex justify-center">
            {/* mx-auto max-w-7xl justify-center px-4 sm:px-6 lg:px-8 */}
            <div className="fixed flex items-center justify-center space-x-2 rounded-full bg-white px-4 py-2 shadow-sm">
                <Link href={getPath()} className="flex flex-row items-center justify-center gap-2">
                    {circle?.picture && (
                        <Image
                            src={circle?.picture?.url}
                            alt="Circle Logo"
                            width={24}
                            height={24}
                            className="rounded-full"
                        />
                    )}
                    <span className="text-sm font-medium text-gray-800">{circle?.name}</span>
                </Link>
                {page && (
                    <>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-600">
                            <Link href={getPath(page)}>{page.name}</Link>
                        </span>
                    </>
                )}
                {subpage && (
                    <>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-600">{subpage}</span>
                    </>
                )}
            </div>
            <div className="h-10"></div>
        </div>
    );
};

export default CircleHeader;
