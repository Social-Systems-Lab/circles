"use client";

import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { useTransition } from "react";
import { logOut } from "../auth/actions";
import { Loader2 } from "lucide-react";
import { userAtom, authenticatedAtom } from "@/lib/data/atoms";
import { useAtom } from "jotai";

export const ProfileMenu = () => {
    const router = useRouter();
    const [authenticated, setAuthenticated] = useAtom(authenticatedAtom);
    const [user, setUser] = useAtom(userAtom);
    const [isPending, startTransition] = useTransition();

    const onLogInClick = () => {
        router.push("/login");
    };

    const onSignUpClick = () => {
        router.push("/signup");
    };

    const onLogOutClick = async () => {
        startTransition(async () => {
            await logOut();
            setAuthenticated(false);
            setUser(undefined);
            router.push("/logged-out");
        });
    };

    if (authenticated === undefined) {
        return null;
    }

    return (
        <div className="flex flex-row items-center justify-center gap-1 pr-4">
            {authenticated && (
                <Button className="h-full w-full" onClick={onLogOutClick} variant="outline">
                    {isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Logging out...
                        </>
                    ) : (
                        "Log out"
                    )}
                </Button>
            )}

            {!authenticated && (
                <>
                    <Button className="h-full w-full" onClick={onLogInClick} variant="link">
                        Log in
                    </Button>
                    <Button className="h-full w-full" onClick={onSignUpClick} variant="outline">
                        Sign up
                    </Button>
                </>
            )}
        </div>
    );
};