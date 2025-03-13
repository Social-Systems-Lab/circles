import { FormSchema } from "../../../../models/models";

export const questionSchema: FormSchema = {
    id: "question-form",
    title: "Question",
    description: "Add a question to the questionnaire",
    button: {
        text: "Add Question",
    },
    fields: [
        {
            name: "question",
            label: "Question",
            type: "text",
            required: true,
            showInHeader: true,
        },
        {
            name: "type",
            label: "Answer Type",
            type: "select",
            options: [
                { value: "text", label: "Text" },
                { value: "yesno", label: "Yes/No" },
            ],
            required: true,
            showInHeader: true,
        },
    ],
};

export const circleQuestionnaireFormSchema: FormSchema = {
    id: "circle-questionnaire-form",
    title: "Questionnaire",
    description:
        "Create and manage the questionnaire for your circle. These questions are asked to new members when they request to follow the circle.",
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
            name: "questionnaire",
            label: "Questions",
            type: "table",
            required: false,
            itemSchema: questionSchema,
            defaultValue: {
                question: "New Question",
                type: "text",
            },
        },
    ],
};
