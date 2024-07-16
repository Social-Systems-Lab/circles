import Image from "next/image";
import unauthorized from "@images/unauthorized.png";
import { Suspense } from "react";
import RedirectButtons from "@/components/redirectPage/redirect-buttons";

export default function Unauthenticated() {
    return (
        <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center justify-center pb-[200px]">
                <Image src={unauthorized} alt="" width={400} />
                <h4>Access Denied</h4>
                You do not have permission to view this page.
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
