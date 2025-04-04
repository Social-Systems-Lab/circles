import { MatchmakingSettingsForm } from "@/components/forms/circle-settings/matchmaking/matchmaking-settings-form";
import { getCircleByHandle } from "@/lib/data/circle";

type PageProps = {
    params: { handle: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function MatchmakingSettingsPage(props: PageProps) {
    const { handle } = props.params;
    const circle = await getCircleByHandle(handle);

    if (!circle) {
        return <div>Circle not found</div>;
    }

    // Mock causes and skills data
    const causes = [
        { handle: "climate-action", name: "Climate Action" },
        { handle: "social-justice", name: "Social Justice" },
        { handle: "human-rights", name: "Human Rights" },
        { handle: "animal-rights", name: "Animal Rights" },
        { handle: "education", name: "Education" },
        { handle: "health", name: "Health" },
        { handle: "poverty", name: "Poverty" },
        { handle: "gender-equality", name: "Gender Equality" },
    ];

    const skills = [
        { handle: "project-management", name: "Project Management" },
        { handle: "fundraising", name: "Fundraising" },
        { handle: "community-organizing", name: "Community Organizing" },
        { handle: "social-media", name: "Social Media" },
        { handle: "web-development", name: "Web Development" },
        { handle: "graphic-design", name: "Graphic Design" },
        { handle: "writing", name: "Writing" },
        { handle: "public-speaking", name: "Public Speaking" },
    ];

    return (
        <div className="container py-6">
            <h1 className="mb-6 text-2xl font-bold">Matchmaking Settings</h1>
            <p className="mb-6 text-muted-foreground">
                Configure your circle's causes and skills to improve matchmaking with potential members and other
                circles.
            </p>
            <MatchmakingSettingsForm circle={circle} causes={causes} skills={skills} />
        </div>
    );
}
