import Image from "next/image";
import unauthenticated from "@images/unauthenticated.png";
import { Suspense } from "react";
import RedirectButtons from "@/components/redirectPage/redirect-buttons";

export default function Unauthenticated() {
    return (
        <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center justify-center pb-[200px]">
                <Image src={unauthenticated} alt="" width={400} />
                <h4>Oops! You&apos;re not logged in</h4>
                Please log in to access this page.
                <Suspense fallback={<div></div>}>
                    <RedirectButtons
                        buttons={[
                            { text: "Log in", href: "/login?redirectTo={redirectTo}" },
                            { text: "Sign up", href: "/signup?redirectTo={redirectTo}" },
                        ]}
                    />
                </Suspense>
            </div>
        </div>
    );
}
