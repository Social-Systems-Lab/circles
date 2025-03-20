"use server";

import { getCircleById } from "@/lib/data/circle";

export async function getCircleByIdAction(id: string) {
  try {
    return await getCircleById(id);
  } catch (error) {
    console.error("Error getting circle by ID:", error);
    throw new Error("Failed to get circle");
  }
}