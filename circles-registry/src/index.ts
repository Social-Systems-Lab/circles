import { Hono } from "hono";
import { cors } from "hono/cors";
import { prettyJSON } from "hono/pretty-json";
import servers from "./routes/servers";
import users from "./routes/users";
import { connectToDatabase } from "./data/db";

const app = new Hono();

app.use("*", cors());
app.use("*", prettyJSON());

app.route("/servers", servers);
app.route("/users", users);

app.get("/", (c) => c.text("Circles Central Registry Service"));

connectToDatabase().catch(console.error);

export default {
    port: 3001,
    fetch: app.fetch,
};
