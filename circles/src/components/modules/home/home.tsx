import { getAuthenticatedUserDid, isAuthorized } from "@/lib/auth/auth";
import { features } from "@/lib/data/constants";
import { Circle } from "@/models/models";
import EditableHomeModule from "./editable-home";
import StaticHomeModule from "./static-home";

type HomeModuleProps = {
    circle: Circle;
    isDefaultCircle: boolean;
    isUser?: boolean;
};

export default async function HomeModule({ circle, isDefaultCircle, isUser }: HomeModuleProps) {
    let authorizedToEdit = false;
    try {
        const userDid = await getAuthenticatedUserDid();
        authorizedToEdit = await isAuthorized(userDid, circle._id ?? "", features.settings_edit, isUser);
    } catch (error) {}

    return (
        <>
            {authorizedToEdit ? (
                <EditableHomeModule circle={circle} isDefaultCircle={isDefaultCircle} isUser={isUser} />
            ) : (
                <StaticHomeModule circle={circle} isDefaultCircle={isDefaultCircle} isUser={isUser} />
            )}
        </>
    );
}
