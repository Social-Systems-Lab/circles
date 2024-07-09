import { Context, Next } from "hono";
import { verify } from "hono/jwt";

export const auth = async (c: Context, next: Next) => {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) {
        return c.json({ error: "No token provided" }, 401);
    }

    try {
        const payload = await verify(token, process.env.REGISTRY_JWT_SECRET!);
        c.set("user", payload);
        await next();
    } catch (error) {
        return c.json({ error: "Invalid token" }, 401);
    }
};
