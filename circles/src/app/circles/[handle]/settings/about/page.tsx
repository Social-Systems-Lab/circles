import { AboutSettingsForm } from "@/components/forms/circle-settings/about-settings-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCircleByHandle, getCirclePublishStatus } from "@/lib/data/circle";
import { publishCircleAction, submitCircleForVerificationAction } from "./actions";
import { CircleVerificationThreadCard } from "./circle-verification-thread-card";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AboutSettingsPage(props: PageProps) {
    const params = await props.params;
    const { handle } = params;
    const circle = await getCircleByHandle(handle);

    if (!circle) {
        return <div>Circle not found</div>;
    }

    const publishStatus = getCirclePublishStatus(circle);
    const showWorkflowCard = circle.circleType !== "user";
    const isDraft = publishStatus === "draft";
    const isProfileCircle = circle.circleLevel === "profile_child";
    const statusCopy =
        publishStatus === "draft"
            ? "Draft"
            : publishStatus === "pending_verification"
              ? "Pending verification"
              : "Published";
    const statusClassName =
        publishStatus === "draft"
            ? "border-amber-200 bg-amber-100 text-amber-900"
            : publishStatus === "pending_verification"
              ? "border-sky-200 bg-sky-100 text-sky-900"
              : "border-emerald-200 bg-emerald-100 text-emerald-900";

    return (
        <div className="container py-6">
            <h1 className="mb-6 text-2xl font-bold">About Settings</h1>
            <p className="mb-6 text-muted-foreground">
                Manage your circle&apos;s profile information, including name, description, mission, and images.
            </p>
            {showWorkflowCard ? (
                <div className="mb-6 rounded-lg border bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-muted-foreground">Status</span>
                                <Badge className={statusClassName}>{statusCopy}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {publishStatus === "draft"
                                    ? "This circle is saved as a draft and is not publicly live yet."
                                    : publishStatus === "pending_verification"
                                      ? "This circle is waiting for verification and is not publicly live yet."
                                      : "This circle is live and behaves like existing published circles."}
                            </p>
                            {!isProfileCircle && circle.representsOrganization ? (
                                <p className="text-sm text-muted-foreground">
                                    This verification will be reviewed as an organization claim using the website and
                                    official email you provided.
                                </p>
                            ) : null}
                        </div>
                        {isDraft ? (
                            isProfileCircle ? (
                                <form action={publishCircleAction}>
                                    <input type="hidden" name="circleId" value={circle._id} />
                                    <Button type="submit">Publish circle</Button>
                                </form>
                            ) : (
                                <form action={submitCircleForVerificationAction}>
                                    <input type="hidden" name="circleId" value={circle._id} />
                                    <Button type="submit" variant="outline">
                                        Submit for verification
                                    </Button>
                                </form>
                            )
                        ) : null}
                    </div>
                </div>
            ) : null}
            {showWorkflowCard && !isProfileCircle && publishStatus === "pending_verification" ? (
                <CircleVerificationThreadCard circleId={String(circle._id)} />
            ) : null}
            <AboutSettingsForm circle={circle} />
        </div>
    );
}
