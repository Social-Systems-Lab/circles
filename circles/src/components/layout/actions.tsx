// actions.ts
"use server";

import { Circle } from "@/models/models";
import { getCircleById, updateCircle } from "@/lib/data/circle";

type GetCircleResponse = {
    circle: Circle;
};
export const getCircleAction = async (circleId: string): Promise<GetCircleResponse> => {
    let circle = await getCircleById(circleId);

    let response: GetCircleResponse = {
        circle,
    };
    return response;
};
