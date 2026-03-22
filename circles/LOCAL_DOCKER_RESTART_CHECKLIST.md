# Local Docker Restart Checklist

Use this after restarting your Mac, Docker, or the local Kamooni stack.

## Goal

Make sure localhost is talking to the Docker services you expect, especially MongoDB.

---

## 1. Confirm Docker is running

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

Check that the main Kamooni containers are up, especially:

circles-circles-1
circles-db-1
circles-minio-1
circles-qdrant-1
2. Check for Mongo port conflicts on the host
lsof -nP -iTCP:27017 -sTCP:LISTEN

Healthy result:

Docker is listening on 27017

Problem case:

a local Mac mongod is also listening on 127.0.0.1:27017

If a local mongod is present, localhost dev may connect to the wrong Mongo instance.

3. If needed, stop the local Mac mongod

Inspect first:

lsof -nP -iTCP:27017 -sTCP:LISTEN

If you see a local mongod, stop that PID only:

kill <PID>

Then confirm only Docker is still listening:

lsof -nP -iTCP:27017 -sTCP:LISTEN
4. Verify Mongo auth from the host
mongosh "mongodb://admin:password@127.0.0.1:27017/admin?authSource=admin" --eval "db.runCommand({ connectionStatus: 1 })"

Healthy result:

ok: 1
authenticated user is admin

If auth fails here, localhost dev will also fail.

5. Start localhost dev
cd ~/circles/circles && npm run dev
6. Load localhost and confirm basic health

Check that:

the app loads
there are no Mongo auth errors in the dev terminal
Notification Settings opens correctly
settings persist after close/reopen
Fast diagnosis summary

If localhost shows Mongo authentication errors after a restart, check these in order:

docker ps
lsof -nP -iTCP:27017 -sTCP:LISTEN
stop any local Mac mongod
test host auth with mongosh
restart npm run dev
Notes
The Dockerized app may still work even when localhost dev fails.
This usually means localhost is reaching a different Mongo listener than the Docker app.
In this project, that has happened when a Mac-host mongod was also bound to 127.0.0.1:27017.
