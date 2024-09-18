import Image from "next/image";
import notFound from "@images/not-found.png";
import RedirectButtons from "@/components/redirectPage/redirect-buttons";

export default function NotFound() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-start pt-[10vh] md:pt-[15vh]">
            <div className="flex flex-col items-center justify-center">
                <Image src={notFound} alt="" width={400} />
                <h4>Page not found</h4>
                We couldn&apos;t find the page you were looking for.
                <RedirectButtons buttons={[{ text: "Go to Home", href: "{redirectTo}" }]} />
            </div>
        </div>
    );
}
