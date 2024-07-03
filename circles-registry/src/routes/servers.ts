import { Hono } from "hono";
import { z } from "zod";

const servers = new Hono();

servers.post("/register", async (c) => {
    // Implement server registration logic
});

servers.get("/:serverId", async (c) => {
    // Implement get server details logic
});

export default servers;
