import { QuestionnaireSettingsForm } from "@/components/forms/circle-settings/questionnaire/questionnaire-settings-form";
import { getCircleByHandle } from "@/lib/data/circle";

type PageProps = {
    params: { handle: string };
    searchParams: { [key: string]: string | string[] | undefined };
};

export default async function QuestionnaireSettingsPage(props: PageProps) {
    const { handle } = props.params;
    const circle = await getCircleByHandle(handle);

    if (!circle) {
        return <div>Circle not found</div>;
    }

    return (
        <div className="container py-6">
            <h1 className="mb-6 text-2xl font-bold">Questionnaire Settings</h1>
            <p className="mb-6 text-muted-foreground">
                Manage the questions that new members will be asked when they join your circle. These questions help you
                gather information about potential members.
            </p>
            <QuestionnaireSettingsForm circle={circle} />
        </div>
    );
}
