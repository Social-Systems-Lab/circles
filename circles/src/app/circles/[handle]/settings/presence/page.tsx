import { PresenceSettingsForm } from "@/components/forms/circle-settings/presence-settings-form";
import { toPresenceSettingsDto } from "@/lib/data/presence-settings-dto";
import { notFound } from "next/navigation";
import { getCirclePageAccess } from "../../circle-page-access";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PresenceSettingsPage(props: PageProps) {
    const { handle } = await props.params;
    const access = await getCirclePageAccess(handle);
    if (!access?.viewerDid || !access.canEditAbout) notFound();

    const isUser = access.circle.circleType === "user";

    return (
        <div className="container py-6">
            <h1 className="mb-6 text-2xl font-bold">{isUser ? "Skills & Interests" : "Offers and needs"}</h1>
            <p className="mb-6 text-muted-foreground">
                {isUser
                    ? "Manage what you can offer and the topics or roles you want to engage in."
                    : "Describe your opportunities and what support your circle or project needs."}
            </p>
            <PresenceSettingsForm circle={toPresenceSettingsDto(access.circle)} />
        </div>
    );
}
