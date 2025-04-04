import { redirect } from "next/navigation";

type PageProps = {
    params: { handle: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function SettingsPage(props: PageProps) {
    const { handle } = props.params;

    // Redirect to the about settings page by default
    redirect(`/circles/${handle}/settings/about`);
}
