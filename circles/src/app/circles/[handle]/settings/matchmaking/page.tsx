import { getCircleByHandle } from "@/lib/data/circle";
import { MatchmakingSettingsForm } from "@/components/forms/circle-settings/matchmaking-settings-form";
import { Separator } from "@/components/ui/separator";

type MatchmakingSettingsProps = {
    params: { handle: string };
};

export default async function MatchmakingSettings(props: MatchmakingSettingsProps) {
    const circle = await getCircleByHandle(props.params.handle);

    if (!circle) {
        return <div>Circle not found</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Matchmaking</h3>
                <p className="text-sm text-muted-foreground">
                    Configure your circle&apos;s SDGs and skills to improve matchmaking with potential members and other
                    circles.
                </p>
            </div>
            <Separator />
            <MatchmakingSettingsForm circle={circle} />
        </div>
    );
}
