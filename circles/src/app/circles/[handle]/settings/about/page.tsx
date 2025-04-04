import { AboutSettingsForm } from "@/components/forms/circle-settings/about-settings-form";
import { getCircleByHandle } from "@/lib/data/circle";

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

    return (
        <div className="container py-6">
            <h1 className="mb-6 text-2xl font-bold">About Settings</h1>
            <p className="mb-6 text-muted-foreground">
                Manage your circle&apos;s profile information, including name, description, mission, and images.
            </p>
            <AboutSettingsForm circle={circle} />
        </div>
    );
}
