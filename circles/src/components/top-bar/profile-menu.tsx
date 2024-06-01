"use client";

import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { useCallback, useEffect, useState, useTransition } from "react";
import { checkAuth, logOut } from "./actions";
import { useThrottle } from "../utils/use-throttle";
import { User } from "@/models/models";
import { Loader2 } from "lucide-react";

export const ProfileMenu = () => {
    const router = useRouter();
    const [authenticated, setAuthenticated] = useState(false);
    const [user, setUser] = useState<User | undefined>(undefined);
    const [isPending, startTransition] = useTransition();

    const checkAuthStatus = useCallback(async () => {
        startTransition(async () => {
            console.log("calling getStreamedAnswer()");
            const { user, authenticated: authStatus } = await checkAuth();
            setAuthenticated(authStatus);
            setUser(user);
        });
    }, []);

    const throttledCheckAuth = useThrottle(checkAuthStatus, 500);

    useEffect(() => {
        throttledCheckAuth();
    }, [throttledCheckAuth]);

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

    return (
        <div className="flex flex-row items-center justify-center gap-1 pr-4">
            {!isPending && (
                <>
                    {authenticated && (
                        <Button className="h-full w-full" onClick={onLogOutClick} variant="outline">
                            Log out
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
                </>
            )}

            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        </div>
    );
};
