import { Hono } from "hono";
import { Context, Next } from "hono";
import { z } from "zod";

const servers = new Hono();

servers.post("/register", async (c: Context) => {
    // TODO implement server registration logic
    return c.json({ success: true, challenge: "dummy challenge" });
});

servers.post("/register-confirm", async (c: Context) => {
    // TODO implement server registration confirmation logic
    return c.json({ success: true, message: "Server registered" });
});

servers.get("/:serverId", async (c) => {
    // Implement get server details logic
});

export default servers;
