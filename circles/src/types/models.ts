import { StaticImageData } from "next/image";
import { z } from "zod";

export const circleSchema = z.object({
    name: z.string(),
    picture: z.string().optional(),
    cover: z.string().optional(),
});

export type Circle = z.infer<typeof circleSchema>;
