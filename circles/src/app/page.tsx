import Image from "next/image";
import type { Circle } from "../types/models";
import { sidePanelWidthPx, coverHeightPx } from "./constants";

type CircleCoverProps = {
    circle: Circle;
};

const CircleCover = ({ circle }: CircleCoverProps) => {
    return (
        <div className={`relative h-[${coverHeightPx}] w-full`}>
            {circle.cover && <Image src={circle.cover} alt="Cover" objectFit="cover" sizes="100vw" fill />}
        </div>
    );
};

export default function Home() {
    const circle: Circle = {
        picture: "/images/picture.png",
        cover: "/images/cover.png",
        name: "Social Systems Lab",
    };

    return <CircleCover circle={circle} />;
}
