import Image from "next/image";
import loggedOut from "@images/logged-out.png";
import RedirectButtons from "@/components/redirectPage/redirect-buttons";

export default function LoggedOut() {
    return (
        <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center justify-center pb-[200px] pt-[40px]">
                <Image src={loggedOut} alt="" width={400} />
                <h4>You&apos;ve been logged out</h4>
                We hope to see you again soon!
                <RedirectButtons
                    buttons={[
                        { text: "Log in", href: "/login?redirectTo={redirectTo}" },
                        { text: "Return to page", href: "{redirectTo}" },
                    ]}
                />
            </div>
        </div>
    );
}
