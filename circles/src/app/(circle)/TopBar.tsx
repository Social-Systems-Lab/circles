import Image from "next/image";
import Link from "next/link";
import TopBarNavItems from "./TopBarNavItems";
import { topBarHeightPx } from "../constants";
import type { Circle } from "../../models/models";

type TopBarProps = {
    circle: Circle;
};

export default function TopBar({ circle }: TopBarProps) {
    return (
        <>
            <div className={`h-[60px] w-full flex-shrink-0`}></div>
            <div className={`fixed top-0 z-40 h-[60px] w-full`}>
                <div className={`flex flex-row items-center h-[60px]`}>
                    <div className="flex flex-row justify-center items-center ml-11 mr-10 flex-shrink-0">
                        <Link href="/">
                            <Image src={circle.picture ?? ""} alt="Logo" width={40} height={40} className="rounded-full overflow-hidden w-[40px] h-[40px]" />
                        </Link>
                        <Link href="/">
                            <h4 className="m-0 p-0 ml-4">{circle.name}</h4>
                        </Link>
                    </div>
                    <TopBarNavItems />
                </div>
            </div>
        </>
    );
}
