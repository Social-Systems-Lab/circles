"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "../ui/button";
import { Suspense, useEffect, useState, useTransition } from "react";
import { logOut } from "../auth/actions";
import { userAtom, authenticatedAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserPicture } from "../modules/members/user-picture";
import { HiOutlineLogout } from "react-icons/hi";
import Link from "next/link";

const ProfileMenuBar = () => {
    const router = useRouter();
    const pathname = usePathname();
    const [authenticated, setAuthenticated] = useAtom(authenticatedAtom);
    const [user, setUser] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();
    const searchParams = useSearchParams();

    const onLogInClick = () => {
        let redirectTo = searchParams.get("redirectTo") ?? "/";
        router.push("/login?redirectTo=" + redirectTo);
    };

    const onSignUpClick = () => {
        let redirectTo = searchParams.get("redirectTo");
        router.push("/signup?redirectTo=" + redirectTo);
    };

    const onLogOutClick = async () => {
        startTransition(async () => {
            await logOut();
            setAuthenticated(false);
            setUser(undefined);

            let redirectTo = pathname ?? "/";
            router.push("/logged-out?redirectTo=" + redirectTo);
        });
    };

    // fixes hydration errors
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return null;
    }

    return (
        <div className="flex flex-row items-center justify-center gap-1 overflow-hidden">
            {authenticated && user && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button className="h-auto w-auto rounded-full p-0" variant="ghost">
                            <UserPicture name={user?.name} picture={user?.picture?.url} size="40px" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-[15px]">
                        <Link href={`/circles/${user?.handle}`}>
                            <div className="flex w-[160px] flex-col items-center justify-center pt-4">
                                <UserPicture name={user?.name} picture={user?.picture?.url} size="108px" />
                                <span className="text-md pb-4 pt-4 font-bold">{user?.name}</span>
                            </div>
                        </Link>
                        <DropdownMenuSeparator />
                        {/* <DropdownMenuItem>Edit Profile</DropdownMenuItem> */}
                        <DropdownMenuItem onClick={onLogOutClick}>
                            <HiOutlineLogout className="mr-2 h-4 w-4" />
                            <span>Log out</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            {authenticated === false && (
                <div className="flex flex-row gap-2">
                    <Button
                        className="h-full w-full bg-[#00000077] text-white"
                        onClick={onLogInClick}
                        variant="outline"
                    >
                        Log in
                    </Button>
                    <Button className="h-full w-full" onClick={onSignUpClick} variant="outline">
                        Sign up
                    </Button>
                </div>
            )}
        </div>
    );
};

export const ProfileMenu = () => {
    return (
        <Suspense>
            <ProfileMenuBar />
        </Suspense>
    );
};
