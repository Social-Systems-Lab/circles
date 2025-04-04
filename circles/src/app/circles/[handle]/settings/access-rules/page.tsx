import { AccessRulesSettingsForm } from "@/components/forms/circle-settings/access-rules-settings-form";
import { getCircleByHandle } from "@/lib/data/circle";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AccessRulesSettingsPage(props: PageProps) {
    const params = await props.params;
    const { handle } = params;
    const circle = await getCircleByHandle(handle);

    if (!circle) {
        return <div>Circle not found</div>;
    }

    return (
        <div className="container py-6">
            <h1 className="mb-6 text-2xl font-bold">Access Rules Settings</h1>
            <p className="mb-6 text-muted-foreground">
                Manage who can access different features in your circle. Assign permissions to user groups to control
                what actions they can perform.
            </p>
            <AccessRulesSettingsForm circle={circle} />
        </div>
    );
}
