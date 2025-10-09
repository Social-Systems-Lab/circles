import Link from "next/link";
import { getCircleByHandle } from "@/lib/data/circle";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams?: { [key: string]: string | string[] | undefined };
};

export default async function CircleNotFoundPage({ params, searchParams }: PageProps) {
    const p = await params;
    const sp = searchParams || {};
    const handle = p.handle;

    // Extract context provided by middleware
    const moduleHandle = (sp.module as string) || undefined;
    const redirectTo = (sp.redirectTo as string) || `/circles/${handle}`;

    // Load circle so the layout renders with proper context
    const circle = await getCircleByHandle(handle);

    const title = "Not found";
    const moduleText = moduleHandle ? `“${moduleHandle}”` : "this page";
    const description = moduleHandle
        ? `The ${moduleText} is not available in this circle. It may be disabled or the item may have been removed.`
        : "The page you are looking for doesn’t exist in this circle.";

    return (
        <div className="mx-auto max-w-3xl px-4 py-10">
            <div className="rounded-lg border border-gray-200 bg-white/60 p-6 shadow-sm backdrop-blur">
                <h1 className="mb-2 text-2xl font-semibold">{title}</h1>
                <p className="text-gray-600">
                    We couldn't find {moduleText} in <span className="font-medium">{circle?.name}</span>.
                </p>
                <p className="mt-1 text-gray-600">{description}</p>
            </div>
        </div>
    );
}
