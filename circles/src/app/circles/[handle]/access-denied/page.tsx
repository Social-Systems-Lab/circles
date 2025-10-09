import Link from "next/link";
import { getCircleByHandle } from "@/lib/data/circle";
import { getAuthenticatedUserDid } from "@/lib/auth/auth";
import { getMember } from "@/lib/data/member";
import { getUserPendingMembershipRequests } from "@/lib/data/membership-requests";
import { requestMembershipAction, cancelMembershipRequestAction } from "@/components/circle/actions";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AccessDeniedPage({ params, searchParams }: PageProps) {
    const p = await params;
    const sp = (await searchParams) || {};
    const handle = p.handle;

    // Extract query params provided by middleware
    const reason = (sp.reason as string) || "unauthorized";
    const moduleHandle = (sp.module as string) || undefined;
    const redirectTo = (sp.redirectTo as string) || `/circles/${handle}`;

    // Load circle to ensure layout gets proper context; middleware guarantees circle exists
    const circle = await getCircleByHandle(handle);

    // Determine authentication and membership state
    const userDid = await getAuthenticatedUserDid();
    const isUnauthenticated = !userDid || reason === "unauthenticated";
    let isMember = false;
    let hasPendingRequest = false;

    if (userDid && circle?._id) {
        const membership = await getMember(userDid, circle._id);
        isMember = !!membership;

        const pending = await getUserPendingMembershipRequests(userDid);
        hasPendingRequest = !!pending.find((r) => r.circleId === circle._id);
    }

    const title = "Access denied";
    const moduleText = moduleHandle ? `“${moduleHandle}”` : "this page";
    const description = isUnauthenticated
        ? "You must sign in to view this page."
        : isMember
          ? "Your current role in this circle does not include access to this module."
          : "You are not a member of this circle. Request membership to get access.";

    return (
        <div className="mx-auto max-w-3xl px-4 py-10">
            <div className="rounded-lg border border-gray-200 bg-white/60 p-6 shadow-sm backdrop-blur">
                <h1 className="mb-2 text-2xl font-semibold">{title}</h1>
                <p className="text-gray-600">
                    You don&apos;t have permission to view {moduleText} in{" "}
                    <span className="font-medium">{circle?.name}</span>.
                </p>
                <p className="mt-1 text-gray-600">{description}</p>

                <div className="mt-6 flex flex-wrap gap-3">
                    {/* Primary CTA */}
                    {isUnauthenticated ? (
                        <Link
                            href={`/login?redirectTo=${encodeURIComponent(redirectTo)}`}
                            className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-white hover:bg-black/90"
                        >
                            Sign in to continue
                        </Link>
                    ) : !isMember ? (
                        hasPendingRequest ? (
                            <>
                                <span className="inline-flex items-center rounded-md bg-amber-100 px-3 py-1.5 text-sm text-amber-800">
                                    Request pending
                                </span>
                                <form action={cancelMembershipRequestAction}>
                                    <input type="hidden" name="circleId" value={circle?._id ?? ""} />
                                    <input type="hidden" name="redirectTo" value={redirectTo} />
                                    <button
                                        type="submit"
                                        className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-800 hover:bg-gray-50"
                                    >
                                        Cancel request
                                    </button>
                                </form>
                            </>
                        ) : (
                            <form action={requestMembershipAction}>
                                <input type="hidden" name="circleId" value={circle?._id ?? ""} />
                                <input type="hidden" name="redirectTo" value={redirectTo} />
                                <button
                                    type="submit"
                                    className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-white hover:bg-black/90"
                                >
                                    Request membership
                                </button>
                            </form>
                        )
                    ) : null}
                </div>
            </div>
        </div>
    );
}
