"use client";

import { useRouter } from "next/navigation";
import { Button } from "../ui/button";

export const ProfileMenu = () => {
    const router = useRouter();

    const onLogInClick = () => {
        router.push("/login");
    };

    const onSignUpClick = () => {
        router.push("/signup");
    };

    return (
        <div className="flex flex-row items-center justify-center gap-1 pr-4">
            <Button className="h-full w-full" onClick={onLogInClick} variant="link">
                Log in
            </Button>
            <Button className="h-full w-full" onClick={onSignUpClick} variant="outline">
                Sign up
            </Button>
        </div>
    );
};
