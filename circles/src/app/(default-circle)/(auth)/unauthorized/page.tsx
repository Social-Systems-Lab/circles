import Image from "next/image";
import unauthorized from "@images/unauthorized.png";
import RedirectButtons from "@/components/redirectPage/redirect-buttons";

export default function Unauthenticated() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-start pt-[10vh] md:pt-[15vh]">
            <div className="flex flex-col items-center justify-center">
                <Image src={unauthorized} alt="" width={400} />
                <h4>Access Denied</h4>
                You do not have permission to view this page.
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
