import { StaticImageData } from "next/image";

export type Circle = {
    picture: string | StaticImageData;
    cover: string | StaticImageData;
    name: string;
};
