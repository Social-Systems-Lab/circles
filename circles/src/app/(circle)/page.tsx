import Image from "next/image";
import type { Circle } from "../../models/models";
import { sidePanelWidthPx, coverHeightPx } from "../constants";

type CircleCoverProps = {
    circle: Circle;
};

const CircleCover = ({ circle }: CircleCoverProps) => {
    return <div className={`relative h-[400px] w-full`}>{circle.cover && <Image src={circle.cover} alt="Cover" objectFit="cover" sizes="100vw" fill />}</div>;
};

export default function Home() {
    const circle: Circle = {
        handle: "social-systems-lab",
        picture: "/images/picture.png",
        cover: "/images/cover.png",
        name: "Social Systems Lab",
    };

    return <CircleCover circle={circle} />;
}
