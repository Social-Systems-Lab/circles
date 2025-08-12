import { PresenceSettingsForm } from "@/components/forms/circle-settings/presence-settings-form";
import { getCircleByHandle } from "@/lib/data/circle";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PresenceSettingsPage(props: PageProps) {
    const params = await props.params;
    const { handle } = params;
    const circle = await getCircleByHandle(handle);

    if (!circle) {
        return <div>Circle not found</div>;
    }

    return (
        <div className="container py-6">
            <h1 className="mb-6 text-2xl font-bold">Presence Settings</h1>
            <p className="mb-6 text-muted-foreground">
                Manage your presence cards to let others know what you have to offer, what you need, and what you want
                to engage in.
            </p>
            <PresenceSettingsForm circle={circle} />
        </div>
    );
}
