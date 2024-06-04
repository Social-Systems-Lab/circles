import Image from "next/image";
import { cn } from "@/lib/utils";
import { Circle } from "@/models/models";

type CircleCoverProps = {
    circle: Circle;
};

const CircleCover = ({ circle }: CircleCoverProps) => {
    return (
        <div className={`relative h-[400px] w-full`}>
            <Image
                src={circle?.cover ?? "/images/default-cover.png"}
                alt="Cover"
                objectFit="cover"
                sizes="100vw"
                fill
            />
        </div>
    );
};

type CirclePictureProps = {
    circle: Circle;
    className?: string;
    size?: number;
};

const CirclePicture = ({ circle, className, size = 40 }: CirclePictureProps) => {
    return (
        <Image
            className={cn("rounded-full border-2 border-white", className)}
            src={circle?.picture ?? "/images/default-picture.png"}
            alt="Picture"
            objectFit="cover"
            width={size}
            height={size}
        />
    );
};

type HomeProps = {
    circle: Circle;
};

export default async function HomeModule({ circle }: HomeProps) {
    return (
        <div className="flex flex-1 flex-col">
            <CircleCover circle={circle} />
            <div className="relative flex justify-center">
                <div className="absolute top-[-60px]">
                    <CirclePicture circle={circle} size={124} />
                </div>
            </div>
        </div>
    );
}
