import Image from "next/image";
import loggedOut from "@images/logged-out.png";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function LoggedOut({ searchParams }: { searchParams?: { [key: string]: string | undefined } }) {
    return (
        <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center justify-center pb-[200px]">
                <Image src={loggedOut} alt="" width={400} />
                <h4>You&apos;ve been logged out</h4>
                We hope to see you again soon!
                <div className="mt-4 flex flex-row gap-2">
                    <Link href={`/login?redirectTo=${searchParams?.redirectTo ?? "/"}`}>
                        <Button variant="outline">Log in</Button>
                    </Link>
                    <Link href={`${searchParams?.redirectTo ?? "/"}`}>
                        <Button variant="outline">Return to page</Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
