import { ServerSettingsForm } from "@/components/forms/circle-settings/server-settings-form";
import { getCircleByHandle } from "@/lib/data/circle";
import { getServerSettings } from "@/lib/data/server-settings";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ServerSettingsPage(props: PageProps) {
    const params = await props.params;
    const { handle } = params;
    const circle = await getCircleByHandle(handle);

    if (!circle) {
        return <div>Circle not found</div>;
    }

    // Check if user is admin
    if (!circle.isAdmin) {
        return <div>You do not have permission to access server settings</div>;
    }

    // Get server settings
    const serverSettings = await getServerSettings();

    return (
        <div className="container py-6">
            <h1 className="mb-6 text-2xl font-bold">Server Settings</h1>
            <p className="mb-6 text-muted-foreground">
                Configure server-wide settings including API keys and server information. These settings affect the
                entire application.
            </p>
            <ServerSettingsForm circle={circle} serverSettings={serverSettings} />
        </div>
    );
}
