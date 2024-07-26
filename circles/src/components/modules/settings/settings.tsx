"use server";

import DynamicForm from "@/components/forms/dynamic-form";
import { ModulePageProps } from "../dynamic-page";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getServerSettings } from "@/lib/data/server-settings";
import MembershipGateway from "../membership-requests/membership-requests";
import { getAllMembershipRequestsAction } from "../membership-requests/actions";

export default async function SettingsModule({ circle, page, subpage, isDefaultCircle }: ModulePageProps) {
    const getFormSchemaId = () => {
        switch (subpage) {
            default:
            case "about":
                return "circle-about-form";
            case "user-groups":
                return "circle-user-groups-form";
            case "access-rules":
                return "circle-access-rules-form";
            case "pages":
                return "circle-pages-form";
            case "questionnaire":
                return "circle-questionnaire-form";
            case "server-settings":
                return "server-settings-form";
        }
    };

    const getSettingsComponent = async () => {
        switch (subpage) {
            default:
                return (
                    <DynamicForm
                        formSchemaId={getFormSchemaId()}
                        initialFormData={initialFormData}
                        maxWidth="none"
                        page={page}
                        subpage={subpage}
                        showReset={true}
                    />
                );
            case "membership-requests":
                const { success, pendingRequests, rejectedRequests, message } = await getAllMembershipRequestsAction(
                    circle._id,
                );
                if (!success) {
                    // Handle error, maybe return an error component
                    return <div>{message}</div>;
                }

                return (
                    <MembershipGateway
                        circle={circle}
                        page={page}
                        pendingRequests={pendingRequests ?? []}
                        rejectedRequests={rejectedRequests ?? []}
                    />
                );
        }
    };

    let initialFormData = circle;
    if (subpage === "server-settings") {
        let serverSettings = await getServerSettings();
        initialFormData = serverSettings;
    }

    return (
        <>
            <div className="flex h-full flex-1 items-start md:pl-8 lg:grow-[2] lg:justify-center">
                {getSettingsComponent()}
            </div>
            <div className="flex flex-1"></div>
        </>
    );
}
