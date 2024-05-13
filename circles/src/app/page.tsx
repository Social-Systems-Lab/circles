import Image from "next/image";
import picture from "@images/picture.png";
import cover from "@images/cover.png";
import type { Circle } from "../types/models";

type CircleCoverProps = {
    circle: Circle;
};

const CircleCover = ({ circle }: CircleCoverProps) => {
    return (
        <div className="relative h-[400px] w-full">
            <Image src={circle.cover} alt="Cover" layout="fill" objectFit="cover" />
        </div>
    );
};

export default function Home() {
    const circle: Circle = {
        picture: picture,
        cover: cover,
        name: "Social Systems Lab",
    };

    return (
        <div className="flex-1">
            <CircleCover circle={circle} />
        </div>
    );
}
