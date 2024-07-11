import { FormSchema } from "../../../../models/models";

export const serverSettingsFormSchema: FormSchema = {
    id: "server-settings-form",
    title: "Server Settings",
    description: "Configure server settings",
    button: {
        text: "Save Configuration",
    },
    fields: [
        {
            name: "defaultCircleId",
            type: "hidden",
            label: "Default Circle ID",
            required: false,
        },
        {
            name: "name",
            label: "Name",
            type: "text",
            required: true,
            description: "Name of this Circles instance",
        },
        {
            name: "description",
            label: "Description",
            type: "textarea",
            required: false,
            description: "Description of this Circles instance",
        },
        {
            name: "url",
            label: "Circles URL",
            type: "text",
            required: true,
            description: "The URL of this Circles instance",
        },
        {
            name: "registryUrl",
            label: "Circles Registry URL",
            type: "registry-info",
            required: false,
            description: "The URL of the Circles Registry service",
        },
        {
            name: "jwtSecret",
            label: "JWT Secret",
            type: "password",
            required: true,
            description: "Secret key of the JWT token for user authentication",
        },
        {
            name: "openaiKey",
            label: "OpenAI API Key",
            type: "password",
            required: true,
            description: "API key for OpenAI services",
        },
        {
            name: "mapboxKey",
            label: "Mapbox API Key",
            type: "password",
            required: true,
            description: "API key for Mapbox services",
        },
    ],
};
