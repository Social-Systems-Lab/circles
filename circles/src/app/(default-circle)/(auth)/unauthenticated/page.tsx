import Image from "next/image";
import unauthenticated from "@images/unauthenticated.png";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function Unauthenticated({
    searchParams,
}: {
    searchParams?: { [key: string]: string | undefined };
}) {
    return (
        <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center justify-center pb-[200px]">
                <Image src={unauthenticated} alt="" width={400} />
                <h4>Oops! You&apos;re not logged in</h4>
                Please log in to access this page.
                <div className="mt-4 flex flex-row gap-2">
                    <Link href={`/login?redirectTo=${searchParams?.redirectTo ?? "/"}`}>
                        <Button variant="outline">Log in</Button>
                    </Link>
                    <Link href={`/signup?redirectTo=${searchParams?.redirectTo ?? "/"}`}>
                        <Button variant="outline">Sign up</Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
