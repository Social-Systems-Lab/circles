import Link from "next/link";

export default function MembershipSuccessPage() {
    return (
        <div className="container py-12">
            <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-8 shadow-sm">
                <h1 className="text-3xl font-bold tracking-tight">Thank you for supporting Kamooni</h1>
                <p className="mt-4 text-muted-foreground">
                    Your membership purchase was received. Your account will update shortly once Stripe confirms the
                    payment.
                </p>
                <div className="mt-6">
                    <Link
                        href="/circles"
                        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-primary-foreground"
                    >
                        Continue to Kamooni
                    </Link>
                </div>
            </div>
        </div>
    );
}
