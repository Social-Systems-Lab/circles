import Link from "next/link";

export default function NotFound() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#f7f2ea] px-6 text-center text-[#181512]">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#e8720c]">
                Peerify
            </p>
            <h1 className="mt-4 text-4xl font-semibold">Page not found</h1>
            <p className="mt-4 max-w-md text-[#6b5f52]">
                We could not find the page you were looking for.
            </p>
            <Link
                href="/"
                className="mt-8 rounded-full bg-[#e8720c] px-5 py-3 text-sm font-semibold text-[#181512] hover:bg-[#ff8c2a]"
            >
                Go to Peerify home
            </Link>
        </div>
    );
}
