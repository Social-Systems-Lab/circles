# Nginx config (Kamooni / Circles)

This deployment uses a static nginx.conf bind-mounted into the nginx container.

Key detail:
- Nginx is configured to use Docker's embedded DNS resolver:
  resolver 127.0.0.11 valid=10s ipv6=off;

- The upstream is referenced via a variable:
  set $circles_upstream "circles:3000";
  proxy_pass http://$circles_upstream;

Why:
This forces nginx to re-resolve the `circles` service name and avoids caching a stale container IP after restarts/recreates.
