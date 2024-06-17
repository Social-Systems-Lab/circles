"use server";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { Circle } from "@/models/models";
import JoinButton from "./join-button";
import { FaUsers } from "react-icons/fa6";

type CircleCoverProps = {
    circle: Circle;
};

const CircleCover = ({ circle }: CircleCoverProps) => {
    return (
        <div className={`relative h-[400px] w-full`}>
            <Image
                src={circle?.cover?.url ?? "/images/default-cover.png"}
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
            src={circle?.picture?.url ?? "/images/default-picture.png"}
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
                <div className="absolute right-2 top-2">
                    <JoinButton circle={circle} />
                </div>
            </div>

            <div className="mb-8 mt-[44px] flex flex-col items-center justify-center">
                <h4>{circle.name}</h4>
                <p className="pl-4 pr-4">{circle.description}</p>
                    <div className="flex flex-row items-center justify-center">
                        <FaUsers />
                        <p className="m-0 ml-2 mr-4">
                            {circle?.members}
                        </p>
                        {/* <PiMapPinFill />
                        <p className="m-0 ml-2">{selectedCircle?.location}</p> */}
                    </div>
                )} */}
            </div>
        </div>
    );
}
