import Image from "next/image";
import Link from "next/link";
import type { Circle } from "../../models/models";
import { ProfileMenu } from "./profile-menu";
import LeftBarNavItems from "./left-bar-nav-items";

type LeftBarProps = {
    circle: Circle;
    isDefaultCircle: boolean;
};

export default function LeftBar({ circle, isDefaultCircle }: LeftBarProps) {
    return (
        <>
            <div className={`h-screen w-[72px] flex-shrink-0`}></div>
            <div
                className={`fixed top-0 z-[100] h-screen w-[72px] bg-white`}
                style={{
                    boxShadow: "0 2px 6px 2px rgba(60, 64, 67, 0.15)",
                }}
            >
                <div className={`flex w-[72px] flex-col items-center justify-center`}>
                    <div className="mb-4 mt-4 flex flex-shrink-0 flex-col items-center justify-center">
                        <Link href="/">
                            <Image
                                src={circle?.picture?.url ?? "/images/default-picture.png"}
                                alt="Logo"
                                width={40}
                                height={40}
                                className="h-[40px] w-[40px] overflow-hidden rounded-full"
                            />
                        </Link>
                    </div>
                    <LeftBarNavItems circle={circle} isDefaultCircle={isDefaultCircle} />
                </div>
            </div>
            <div className="absolute right-0 top-0 z-40">
                <ProfileMenu />
            </div>
        </>
    );
}
