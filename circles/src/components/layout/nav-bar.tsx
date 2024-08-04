import Image from "next/image";
import Link from "next/link";
import type { Circle } from "../../models/models";
import { ProfileMenu } from "./profile-menu";
import NavBarItems from "./nav-bar-items";

type LeftBarProps = {
    circle: Circle;
    isDefaultCircle: boolean;
};

export default function NavBar({ circle, isDefaultCircle }: LeftBarProps) {
    return (
        <>
            <div className={`order-last h-[72px] w-full flex-shrink-0 md:order-first md:h-full md:w-[72px]`}></div>
            <div
                className={`fixed bottom-0 z-[100] h-[72px] w-full bg-white md:top-0 md:h-full md:w-[72px]`}
                style={{
                    boxShadow: "0 2px 6px 2px rgba(60, 64, 67, 0.15)",
                }}
            >
                <div className={`flex h-[72px] flex-row items-center justify-center md:h-auto md:w-[72px] md:flex-col`}>
                    <div className="ml-4 mr-4 flex flex-shrink-0 flex-col items-center justify-center md:mb-4 md:ml-0 md:mr-0 md:mt-4">
                        <Link href="/">
                            <div className="h-[40px] w-[40px]">
                                <Image
                                    src={circle?.picture?.url ?? "/images/default-picture.png"}
                                    alt="Logo"
                                    className="h-[40px] w-[40px] overflow-hidden rounded-full object-cover"
                                    width={40}
                                    height={40}
                                    objectFit="cover"
                                />
                            </div>
                        </Link>
                    </div>
                    <NavBarItems circle={circle} isDefaultCircle={isDefaultCircle} />
                </div>
            </div>
        </>
    );
}
