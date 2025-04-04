import { redirect } from "next/navigation";

type PageProps = {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function SettingsPage(props: PageProps) {
    const { handle } = await props.params;

    // Redirect to the about settings page by default
    redirect(`/circles/${handle}/settings/about`);
}
