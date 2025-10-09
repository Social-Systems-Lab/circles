import Link from "next/link";

export default function NotFound() {
    const title = "Not found";
    const description =
        "We couldn't find this event in this circle. It may have been removed or you may not have access.";

    return (
        <div className="mx-auto max-w-3xl px-4 py-10">
            <div className="rounded-lg border border-gray-200 bg-white/60 p-6 shadow-sm backdrop-blur">
                <h1 className="mb-2 text-2xl font-semibold">{title}</h1>
                <p className="mt-1 text-gray-600">{description}</p>

                <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                        href="."
                        className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-800 hover:bg-gray-50"
                    >
                        Back to events
                    </Link>
                </div>
            </div>
        </div>
    );
}
