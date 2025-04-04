import { UserGroupsSettingsForm } from "@/components/forms/circle-settings/user-groups/user-groups-settings-form";
import { getCircleByHandle } from "@/lib/data/circle";

type PageProps = {
    params: { handle: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function UserGroupsSettingsPage(props: PageProps) {
    const { handle } = props.params;
    const circle = await getCircleByHandle(handle);

    if (!circle) {
        return <div>Circle not found</div>;
    }

    return (
        <div className="container py-6">
            <h1 className="mb-6 text-2xl font-bold">User Groups Settings</h1>
            <p className="mb-6 text-muted-foreground">
                Manage user groups in your circle. User groups determine what permissions members have and what actions
                they can perform.
            </p>
            <UserGroupsSettingsForm circle={circle} />
        </div>
    );
}
