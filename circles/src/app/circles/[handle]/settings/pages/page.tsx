import { PagesSettingsForm } from "@/components/forms/circle-settings/pages/pages-settings-form";
import { getCircleByHandle } from "@/lib/data/circle";

type PageProps = {
    params: { handle: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function PagesSettingsPage(props: PageProps) {
    const { handle } = props.params;
    const circle = await getCircleByHandle(handle);

    if (!circle) {
        return <div>Circle not found</div>;
    }

    return (
        <div className="container py-6">
            <h1 className="mb-6 text-2xl font-bold">Pages Settings</h1>
            <p className="mb-6 text-muted-foreground">
                Manage the pages that appear in the circle's navigation menu. Enable or disable pages to control what
                functionality is available in your circle.
            </p>
            <PagesSettingsForm circle={circle} />
        </div>
    );
}
