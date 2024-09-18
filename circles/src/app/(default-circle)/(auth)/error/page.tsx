import Image from "next/image";
import notFound from "@images/not-found.png";
import RedirectButtons from "@/components/redirectPage/redirect-buttons";

export default function Error() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-start pt-[10vh] md:pt-[20vh]">
            <div className="flex min-w-[500px] flex-col items-center justify-center">
                <Image src={notFound} alt="" width={400} />
                <h4>Error</h4>
                Something went wrong.
                <RedirectButtons buttons={[{ text: "Go to Home", href: "{redirectTo}" }]} />
            </div>
        </div>
    );
}
