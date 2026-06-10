import Link from "next/link";

export default function DonateSuccessPage() {
    return (
        <div className="relative overflow-hidden bg-kam-hero-yellow/10">
            <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-kam-hero-yellow via-kam-hero-yellow/80 to-transparent" />
            <div className="container relative z-10 py-16">
                <div className="mx-auto max-w-2xl rounded-[32px] border border-black/5 bg-white p-8 shadow-[0_24px_80px_rgba(0,0,0,0.08)] sm:p-10">
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-kam-orange">Thank you</p>
                    <h1 className="mt-4 text-4xl font-bold tracking-tight text-kam-gray-dark sm:text-5xl">
                        Your donation was received
                    </h1>
                    <p className="mt-5 text-lg leading-8 text-kam-gray-dark/80">
                        Thank you for supporting Peerify. Your one-off donation helps fund the community infrastructure
                        that keeps the platform open, ethical, and available to more people.
                    </p>
                    <div className="mt-8">
                        <Link
                            href="/welcome"
                            className="inline-flex items-center rounded-md bg-[hsl(var(--button-primary))] px-5 py-3 text-sm font-medium text-[hsl(var(--button-primary-foreground))]"
                        >
                            Back to Peerify
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
