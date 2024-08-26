import { FormSchema } from "../../../../models/models";

export const circleMatchmakingFormSchema: FormSchema = {
    id: "circle-matchmaking-form",
    title: { user: "Interests and Offers", circle: "Interests and Needs" },
    description: {
        user: "Specify your interests and offers to enable matchmaking and recommendations.",
        circle: "Specify circle interests and needs to enable matchmaking and recommendations for the circle.",
    },
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
            name: "interests",
            label: "Interests",
            type: "tags",
            required: false,
        },
        {
            name: "offers_needs",
            label: { circle: "Needs", user: "Offers" },
            type: "tags",
            required: false,
            autoComplete: "one-time-code",
        },
    ],
};
