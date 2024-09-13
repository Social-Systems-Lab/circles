"use server";

import { ModulePageProps } from "../dynamic-page";
import { getServerSettings } from "@/lib/data/server-settings";
import MembershipGateway from "../membership-requests/membership-requests";
import { getAllMembershipRequestsAction } from "../membership-requests/actions";
import { SettingsForm } from "./settings-form";

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
            case "matchmaking":
                return "circle-matchmaking-form";
        }
    };

    const getSettingsComponent = async () => {
        switch (subpage) {
            default:
                return (
                    <SettingsForm
                        formSchemaId={getFormSchemaId()}
                        initialFormData={initialFormData}
                        page={page}
                        subpage={subpage}
                        circle={circle}
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

    let initialFormData: any = circle;
    if (subpage === "server-settings") {
        let serverSettings = await getServerSettings();
        initialFormData = serverSettings;
    }

    return (
        <>
            {getSettingsComponent()}
            <div className="flex flex-1"></div>
        </>
    );
}
