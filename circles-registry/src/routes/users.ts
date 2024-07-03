import { Hono } from "hono";
import { z } from "zod";

const users = new Hono();

users.post("/register", async (c) => {
    // Implement user registration logic
});

users.get("/:userId/home-server", async (c) => {
    // Implement get user's home server logic
});

export default users;
