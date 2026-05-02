import Link from "next/link";
import { getCircleByHandle } from "@/lib/data/circle";
import { getCircleDefaultPath } from "@/lib/utils/circle-routes";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function CircleNotFoundPage({ params, searchParams }: PageProps) {
    const p = await params;
    const sp = (await searchParams) || {};
    const handle = p.handle;

    // Extract context provided by middleware
    const moduleHandle = (sp.module as string) || undefined;
    // Load circle so the layout renders with proper context
    const circle = await getCircleByHandle(handle);
    const fallbackHref = circle ? getCircleDefaultPath(circle) : `/circles/${handle}/home`;
    const fallbackText = circle?.enabledModules?.includes("home") ? "Go to Home" : "Open Circle";

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
                    We couldn&apos;t find {moduleText} in <span className="font-medium">{circle?.name}</span>.
                </p>
                <p className="mt-1 text-gray-600">{description}</p>
                <div className="mt-6">
                    <Link
                        href={fallbackHref}
                        className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-800 hover:bg-gray-50"
                    >
                        {fallbackText}
                    </Link>
                </div>
            </div>
        </div>
    );
}
