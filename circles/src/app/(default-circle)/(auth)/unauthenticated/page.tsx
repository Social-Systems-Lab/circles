import Image from "next/image";
import unauthenticated from "@images/unauthenticated.png";
import RedirectButtons from "@/components/redirectPage/redirect-buttons";

export default function Unauthenticated() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-start pt-[10vh] md:pt-[15vh]">
            <div className="flex flex-col items-center justify-center">
                <Image src={unauthenticated} alt="" width={400} />
                <h4>Oops! You&apos;re not logged in 2</h4>
                Please log in to access this page.
                <RedirectButtons
                    buttons={[
                        { text: "Log in", href: "/login?redirectTo={redirectTo}" },
                        { text: "Sign up", href: "/signup?redirectTo={redirectTo}" },
                    ]}
                />
            </div>
        </div>
    );
}
