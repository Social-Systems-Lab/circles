import { FormSchema } from "../../../../models/models";

export const userGroupFormSchema: FormSchema = {
    id: "user-group-form",
    title: "User Group",
    description: "Create a user group to organize circle followers and manage access and permissions effectively.",
    button: {
        text: "Save",
    },
    fields: [
        {
            name: "name",
            label: "Name",
            type: "text",
            required: true,
            showInHeader: true,
        },
        {
            name: "handle",
            label: "Handle",
            type: "handle",
            placeholder: "handle",
            description: "Choose a unique handle that will identify the user group on the platform.",
            required: true,
            showInHeader: false,
        },
        {
            name: "title",
            label: "Title",
            type: "text",
            showInHeader: false,
        },
        {
            name: "accessLevel",
            label: "Access Level",
            type: "number",
            required: true,
            showInHeader: true,
        },
        {
            name: "description",
            label: "Description",
            type: "textarea",
            showInHeader: true,
        },
    ],
};

export const circleUserGroupsFormSchema: FormSchema = {
    id: "circle-user-groups-form",
    title: "User Groups",
    description:
        "Organize circle followers into specific user groups to manage access and permissions effectively. Assign members to groups to control their roles and privileges within the circle.",
    button: {
        text: "Save",
    },
    fields: [
        {
            name: "_id",
            type: "hidden",
            label: "ID",
        },
        {
            name: "userGroups",
            label: "User Groups",
            type: "table",
            required: true,
            itemSchema: userGroupFormSchema,
            ensureUniqueField: "handle",
            defaultValue: {
                name: "New User Group",
                handle: "new_user_group",
                title: "Member",
                description: "New user group",
                accessLevel: 300,
            },
        },
    ],
};
