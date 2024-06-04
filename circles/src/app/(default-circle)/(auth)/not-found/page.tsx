import Image from "next/image";
import notFound from "@images/not-found.png";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function NotFound({ searchParams }: { searchParams?: { [key: string]: string | undefined } }) {
    return (
        <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center justify-center pb-[200px]">
                <Image src={notFound} alt="" width={400} />
                <h4>Page not found</h4>
                We couldn&apos;t find the page you were looking for.
                <div className="mt-4 flex flex-row gap-2">
                    <Link href={`${searchParams?.redirectTo ?? "/"}`}>
                        <Button variant="outline">Go to Home</Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
