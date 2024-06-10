import { FormSchema } from "../../../../models/models";

export const pagesFormSchema: FormSchema = {
    id: "pages-form",
    title: "Page",
    description:
        "Manage the pages that appear in the circle's top navigation menu. These pages can be configured to use different modules, determining how they are rendered and what content they display.",
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
            name: "module",
            label: "Module",
            type: "text",
            placeholder: "module",
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

export const circlePagesFormSchema: FormSchema = {
    id: "circle-pages-form",
    title: "Pages",
    description:
        "Manage the pages that appear in the circle's top navigation menu. These pages can be configured to use different modules, determining how they are rendered and what content they display.",
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
            name: "pages",
            label: "Pages",
            type: "table",
            required: true,
            itemSchema: pagesFormSchema,
            ensureUniqueField: "handle",
        },
    ],
};
