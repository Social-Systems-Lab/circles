import Image from "next/image";
import Link from "next/link";
import TopBarNavItems from "./top-bar-nav-items";
import type { Circle } from "../../models/models";
import { ProfileMenu } from "./profile-menu";

type TopBarProps = {
    circle: Circle;
    isDefaultCircle: boolean;
};

export default function TopBar({ circle, isDefaultCircle }: TopBarProps) {
    return (
        <>
            <div className={`h-[60px] w-full flex-shrink-0`}></div>
            <div className={`fixed top-0 z-40 h-[60px] w-full bg-white`}>
                <div className={`flex h-[60px] flex-row items-center`}>
                    <div className="ml-11 mr-10 flex flex-shrink-0 flex-row items-center justify-center">
                        <Link href="/">
                            <Image
                                src={circle?.picture?.url ?? "/images/default-picture.png"}
                                alt="Logo"
                                width={40}
                                height={40}
                                className="h-[40px] w-[40px] overflow-hidden rounded-full"
                            />
                        </Link>
                        <Link href="/">
                            <h4 className="m-0 ml-4 p-0">{circle?.name ?? "Circles"}</h4>
                        </Link>
                    </div>
                    <TopBarNavItems circle={circle} isDefaultCircle={isDefaultCircle} />
                    <ProfileMenu />
                </div>
            </div>
        </>
    );
}
