import Image from "next/image";
import unauthorized from "@images/unauthorized.png";
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
                <Image src={unauthorized} alt="" width={400} />
                <h4>Access Denied</h4>
                You do not have permission to view this page.
                <div className="mt-4 flex flex-row gap-2">
                    <Link href={`${searchParams?.redirectTo ?? "/"}`}>
                        <Button variant="outline">Return to previus page</Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
