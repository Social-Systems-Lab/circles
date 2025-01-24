// nav-bar.tsx

import type { Circle } from "../../models/models";
import NavBarItems from "./nav-bar-items";
import CircleMenu from "./circle-menu";
import { getDefaultCircle } from "@/lib/data/circle";

type LeftBarProps = {
    circle: Circle;
    isDefaultCircle: boolean;
};

export default async function NavBar({ circle, isDefaultCircle }: LeftBarProps) {
    let defaultCircle = await getDefaultCircle();

    return (
        <>
            <div className={`order-last h-[72px] w-full flex-shrink-0 md:order-first md:h-full md:w-[72px]`}></div>
            <div
                className={`fixed bottom-0 z-[100] h-[72px] w-full bg-white shadow-lg md:top-0 md:h-full md:w-[72px]`}
                // style={{
                //     boxShadow: "0 2px 6px 2px rgba(60, 64, 67, 0.15)",
                // }}
            >
                <div className={`flex h-[72px] flex-row items-center justify-center md:h-auto md:w-[72px] md:flex-col`}>
                    <CircleMenu circle={circle} defaultCircle={defaultCircle} isDefaultCircle={isDefaultCircle} />
                    <NavBarItems circle={circle} isDefaultCircle={isDefaultCircle} />
                </div>
            </div>
        </>
    );
}
