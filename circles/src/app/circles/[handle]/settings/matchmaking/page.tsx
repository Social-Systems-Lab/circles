import { MatchmakingSettingsForm } from "@/components/forms/circle-settings/matchmaking-settings-form";
import { getCircleByHandle } from "@/lib/data/circle";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function MatchmakingSettingsPage(props: PageProps) {
    const params = await props.params;
    const { handle } = params;
    const circle = await getCircleByHandle(handle);

    if (!circle) {
        return <div>Circle not found</div>;
    }

    return (
        <div className="container py-6">
            <h1 className="mb-6 text-2xl font-bold">Matchmaking Settings</h1>
            <p className="mb-6 text-muted-foreground">
                Configure your circle&apos;s causes and skills to improve matchmaking with potential members and other
                circles.
            </p>
            <MatchmakingSettingsForm circle={circle} />
        </div>
    );
}
