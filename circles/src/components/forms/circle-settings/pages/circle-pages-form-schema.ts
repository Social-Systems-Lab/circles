import { modules } from "@/components/modules/modules";
import { FormSchema } from "../../../../models/models";

export const pagesFormSchema: FormSchema = {
    id: "pages-form",
    title: "Page",
    description:
        "Manage the pages that appear in the circle's top navigation menu. These pages can be configured to use different modules, determining what kind of content and functionality they provide.",
    button: {
        text: "Save",
    },
    fields: [
        {
            name: "enabled",
            label: "Enabled",
            type: "switch",
            description: "Enable or disable this page. Disabled pages won't appear in the navigation menu.",
            showInHeader: true,
        },
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
            description: "Choose a unique handle that will identify the page on the platform and appear in the URL.",
            required: true,
            showInHeader: false,
        },
        {
            name: "module",
            label: "Module",
            type: "select",
            options: Object.entries(modules).map((x) => ({ value: x[0], label: x[1].name })),
            required: true,
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
        "Manage the pages that appear in the circle's navigation menu. Enable or disable pages to control what functionality is available in your circle.",
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
            type: "pages",
            required: true,
        },
    ],
};
