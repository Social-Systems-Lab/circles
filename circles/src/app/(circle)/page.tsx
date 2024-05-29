import Image from "next/image";
import type { Circle } from "../../models/models";
import { getDefaultCircle } from "@/lib/server-utils";

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

export default async function Home() {
    let circle = await getDefaultCircle(true);
    return <CircleCover circle={circle} />;
}
