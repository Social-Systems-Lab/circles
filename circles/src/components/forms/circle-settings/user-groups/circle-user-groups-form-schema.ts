import { FormSchema } from "../../../../models/models";

export const circleUserGroupsFormSchema: FormSchema = {
    id: "circle-user-groups-form",
    title: "User Groups",
    description:
        "Organize circle members into specific user groups to manage access and permissions effectively. Assign members to groups to control their roles and privileges within the circle.",
    button: {
        text: "Save",
    },
    fields: [
        {
            name: "name",
            label: "Name",
            type: "text",
            required: true,
        },
        {
            name: "handle",
            label: "Handle",
            type: "handle",
            placeholder: "handle",
            description: "Choose a unique handle that will identify the circle on the platform.",
            required: true,
        },
    ],
};
