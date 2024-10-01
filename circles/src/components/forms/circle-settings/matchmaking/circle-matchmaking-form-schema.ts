import { FormSchema } from "../../../../models/models";

export const circleMatchmakingFormSchema: FormSchema = {
    id: "circle-matchmaking-form",
    title: { user: "Causes and Skills", circle: "Causes and Skills Needed" },
    description: {
        user: "Specify your causes and skills to facilitate matchmaking and recommendations.",
        circle: "Specify circle causes and skills needed to facilitate matchmaking and recommendations for the circle.",
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
            name: "causes",
            label: "Causes",
            type: "causes",
            required: false,
        },
        {
            name: "skills",
            label: { circle: "Skills Needed", user: "Skills Offered" },
            type: "skills",
            required: false,
        },
    ],
};
