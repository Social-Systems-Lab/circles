import Image from "next/image";
import notFound from "@images/not-found.png";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import RedirectButtons from "@/components/redirectPage/redirect-buttons";
import { Suspense } from "react";

export default function NotFound() {
    return (
        <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center justify-center pb-[200px]">
                <Image src={notFound} alt="" width={400} />
                <h4>Page not found</h4>
                We couldn&apos;t find the page you were looking for.
                <RedirectButtons buttons={[{ text: "Go to Home", href: "{redirectTo}" }]} />
            </div>
        </div>
    );
}
