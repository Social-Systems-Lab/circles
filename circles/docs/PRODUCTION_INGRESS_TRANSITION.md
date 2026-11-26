# One-time production application ingress transition

Use this procedure for the currently serving production SHA
`47d9ca1b92047702bb83ac35d9ababc9e51daaeb` and pending onboarding deployment
`production-onboarding-20261114-dc9dc405-01`. The application currently publishes
host port 3000. The transition recreates the same immutable application image
without any published port. NGINX continues to own HTTP and HTTPS. Keep the
activation environment, routing record, MongoDB, MinIO, application data and DID
volumes, and cron in place. The operation performs no build or pull, schema
migration, onboarding pause, or email canary.

## Review and approval

- Keep the tool on its reviewed operations commit in a separate clean checkout
  at `/root/circles/ingress-ops`. Keep the production application checkout and
  `origin/main` at their existing revisions for this operation. Both exact Git
  objects used for the Compose models must already be present in
  `/root/circles/circles`. The target model uses the approved Messages release's
  base Compose file and the serving release's activation overlay. The rollback
  model uses the serving release's base and activation files and the same
  checked-in no-ports override.
- The script requires the local production Docker socket and hostname, Docker
  Compose 2.24.4 or later, the exact serving application and read-only operator
  images, the shared maintenance lock, and a protected activation environment
  and routing verifier. Review the operating window, latest recoverable backups,
  and application health. Coordinate with any separate Docker maintenance or
  Watchtower activity before the cutover. Use an existing public storage image under 4 MiB with
  a working optimized-image route for verification.
- Independently verify that all public traffic enters through NGINX and that
  the direct application port is blocked at the host or Cleura network edge
  for both IPv4 and IPv6 before the maintenance window. Confirm no internal
  client needs the host binding and no direct route exists to the app's
  bridge address. Check the effective firewall, load balancer, and Docker
  daemon policy. The tool checks the NAT bridge, running namespace helpers
  and Docker port mappings. The operator verifies the external access policy
  before giving interactive confirmation.
- Review the passing isolated ingress and rollback tests separately from the
  Messages release rehearsal. The latter exercises paused deployment with the
  port already absent and has no coverage of this ingress-only operation.

## Operator steps

Run one step at a time on `kamooniorg` as root. The operations checkout must
already be at the approved full operations commit. In the examples,
`OPS_COMMIT` names that reviewed SHA and `PUBLIC_STORAGE_IMAGE` is the
verified path to an existing public image. Keep the confirmation prompt manual.

If the approved Messages object is missing from the production repository, fetch
it explicitly. This updates the local Git object store without checking out or
advancing a branch or restarting a service.

```bash
git -C /root/circles/circles fetch --no-tags origin 00cd6a38266d70c454e96323154a6112b9a802fc
```

1. Run preflight. It reads the production environment and app inspection
   internally, renders temporary protected Compose models, runs read-only status
   in the already installed registration operator image and checks live HTTPS,
   nginx configuration, storage and cron. It does not restart services.

   ```bash
   python3 -B /root/circles/ingress-ops/circles/scripts/production-ingress-transition.py preflight "$OPS_COMMIT" "$PUBLIC_STORAGE_IMAGE"
   ```

2. After reviewing the preflight summary and receiving separate cutover
   authorization, run the apply operation in an interactive maintenance session.
   It repeats preflight under the shared maintenance lock. Enter
   `REMOVE_APPLICATION_HOST_PORT` at the prompt only after confirming the
   IPv4 and IPv6 ingress policy. It retains the original image under a local
   rollback tag, gracefully drains the existing NGINX, rechecks routing and
   idle operations, replaces the application from the same
   image and reattaches running namespace helpers. It restores the existing
   NGINX container after internal checks and verifies public HTTPS, the exact
   SHA, storage and the optimized-image route.

   ```bash
   python3 -B /root/circles/ingress-ops/circles/scripts/production-ingress-transition.py apply "$OPS_COMMIT" "$PUBLIC_STORAGE_IMAGE"
   ```

3. After the next five-minute watchdog run, check the normal read-only status
   command from the production app checkout. Expect `pending`, the same
   deployment ID, consistent runtime, and a current watchdog with a
   `lastSuccessfulRunAt` later than the cutover. Confirm the production host
   port is absent on both IP families and that an external normal HTTPS request
   reaches the same app SHA. Keep the Messages deployment approval separate.

   ```bash
   cd /root/circles/circles && ./circles/scripts/production-onboarding-control.sh status
   ```

## Rollback and interrupted operations

A detected replacement or public verification failure triggers a rollback under
the same lock. The tool closes NGINX before recovering the serving release's
activation model and exact immutable image. Both the forward and recovery models
omit host port publication. NGINX only reopens after verification of the recovered
container, unchanged routing, database and storage identities, namespace helpers,
and cron. The tool then verifies HTTPS, storage and the exact SHA again. A
verified rollback returns a nonzero status and prints `rollback verified`.
Retain the failed output and confirm the next scheduled watchdog sample.

If NGINX cannot drain, the tool leaves the original application intact. A
timed-out Docker mutation may still be active on the daemon. If Docker state is
uncertain, routing drifts, or recovery verification fails, stop and inspect the
actual containers and routing under the existing maintenance lock. Keep NGINX
closed until the application runtime and ingress are verified. Do not force the
routing mode, recreate the stack, restore the database, republish port 3000, or
start a Messages deployment to recover this operation. An uncatchable process
or host failure requires the same independent review.

## Disposable rehearsal

Run on the local machine or a disposable Docker host. The harness requires the
local `python:3.12-bookworm` and `nginx:1.27.4-alpine` images and working IPv6
loopback. It uses a unique Compose project and random loopback ports. It checks
the actual Git Compose models with synthetic configuration, then exercises
the cutover, application-start failure, failure after reopening NGINX, and
containment after simulated routing and configuration drift.
It verifies the unchanged application image and synthetic onboarding status,
rolls back from failures, and proves port reachability from both loopback
families before the operation and closure on both afterward.

```bash
python3 -B circles/scripts/test-production-ingress-transition.py
```
