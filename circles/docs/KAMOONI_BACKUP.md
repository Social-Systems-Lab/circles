# Kamooni daily backup and restore

The daily backup is designed to take one encrypted Restic snapshot of the whole set each night at **02:30 Johannesburg time**. The timer catches up on a missed run after boot. Restic keeps the most recent snapshot from each of 30 dates with successful backups in the existing Cleura Sto2 repository. Pruning runs after the completed snapshot has passed the tag check.

The set includes every dumpable MongoDB database on the standalone instance, including admin users and roles, both effective DID volumes, the complete single-drive MinIO store, and the configured recovery files. MongoDB's transient `local` database is skipped by MongoDB Database Tools. The MinIO archive preserves object bytes, versions, policies and IAM data in their native format. The set records the MongoDB and MinIO image IDs and available registry digests, plus the deployed application Git SHA. Rebuild the app from that revision and regenerate any derived search index. Docker images, build caches, Qdrant data and the Restic, S3 and alert credentials are outside the set.

**Accepted recovery risk.** Kamooni stays online throughout capture. MongoDB collections, DID files and MinIO objects can reflect different moments. An account created during capture can restore with a missing DID key, and an attachment record can restore without its object. A concurrent file modification can also leave a MinIO or DID archive internally inconsistent, even when the file read succeeds. A failed read, incomplete Mongo dump, missing required bucket or failed upload fails the run. The job checks each required bucket before capture and again as a directory entry in the staged MinIO archive before upload. An isolated restore and application checks establish recoverability. Expect to lose up to a day of changes after a healthy daily run, or more if a run fails.

**Known Genesis2 recovery gap.** Genesis2 lacks the historical `/circles/server/privateKey.pem` and `/circles/server/publicKey.pem` files. MongoDB still holds the original server DID digest. The job archives both DID volumes as they are and continues when the server signing pair is absent. It records `server_did_signing_pair=absent` in `set/manifest.txt` and writes a warning with the run ID to the root-only `/var/log/kamooni-backup/backup.log`. Both DID volumes, user DID data and all other required sources are still required.

## Prepare Genesis2

Use this section as root on `kamooniorg` after a separate approval and once the reviewed files are in the production checkout.

- Use Restic 0.16.4, MongoDB Database Tools compatible with MongoDB 7, Docker, GNU tar and coreutils, gzip, Python 3 and curl. Allow space under `/var/tmp` for the Mongo dump plus the full MinIO and DID tar files and configuration. Staged payloads contain plaintext secrets and private data. The systemd service uses a private temp directory and the script cleans each run directory on exit.
- Verify that the Compose project is `circles`, its three services are `circles`, `db` and `minio`, and the app uses `/circles` and the dedicated `/circles/users` mount for its DID files. MinIO must use a local one-drive `xl-single` store at `/data`. Match the default required bucket names to the actual app settings in `backup.conf`. Every additional bucket on the drive is included automatically.
- Verify the actual Genesis2 configuration paths and symlink layout in a separately approved read-only check. The backup supports a regular app `.env` or the documented absolute link from `/root/circles/circles/circles/.env` to `/home/ubuntu/migration-export/.env`. For the documented link, list the link path in `CONFIG_PATHS`. The archive automatically includes the link and its nonempty regular target at their original paths. For other top-level symlinks, confirm the recovery layout before adapting the source list. [Production notes](kamooni-production-notes.md#environment)
- Keep the Cleura endpoint, S3 recovery credentials and Restic repository password in the off-server recovery records. The job uses the existing repository. Use an S3 identity with read, write, list and delete access for backup and retention.

Create the private directory and install the default source list if absent.

```bash
install -d -m 700 -o root -g root /root/kamooni-backup-config &&
test -e /root/kamooni-backup-config/backup.conf || install -m 600 -o root -g root   /root/circles/circles/circles/scripts/kamooni-backup/backup.conf.example   /root/kamooni-backup-config/backup.conf
```

Use the existing secrets in `/root/kamooni-backup-config/` with the filenames and formats below. Use regular root-owned files with mode `0600` or `0400`. Use a protected editor or the approved secret provisioning method and keep credential values out of terminal output and shell history.

| File | Contents |
| --- | --- |
| `backup.conf` | Use the installed example. Set the live required bucket names. Add every effective Compose override and separate recovery path, including the activation overlay, external onboarding secrets and relevant host unit/drop-ins when active. Use absolute, existing paths and include only recovery material. |
| `mongo.yaml` | A MongoDB Tools config with one `uri:` entry for the local MongoDB port. Use an authenticated user with the built-in `backup` role on `admin`. Use a server-level URI in the form `mongodb://USER:URL_ENCODED_PASSWORD@127.0.0.1:27017/?authSource=admin`. The empty path preserves whole-instance scope. |
| `restic.env` | Bash assignments for `RESTIC_REPOSITORY` with the existing `s3:` repository URL, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. Add `AWS_SESSION_TOKEN` if your keys require one. |
| `restic.pass` | The existing repository password as one line. |
| `postmark.header` | One line in the form `X-Postmark-Server-Token: TOKEN` for the approved alert sender. |
| `postmark.json` | Postmark payload with `From`, `To`, `Subject` and `TextBody`. Use a verified sender and the operator mailbox. Suggested subject is `[Kamooni backup] Failed on kamooniorg`. In the body, direct the operator to `journalctl -u kamooni-backup.service -n 50`. Use static text so no tool diagnostics or account data go into email. |

## Install and enable

Run each block in order on Genesis2 as root. Stop on a failure.

1. Install the script and units.

   ```bash
   cd /root/circles/circles/circles/scripts/kamooni-backup &&
   install -m 755 -o root -g root kamooni-backup.sh /usr/local/sbin/kamooni-backup &&
   install -m 644 -o root -g root systemd/kamooni-backup{,-failure}.service      systemd/kamooni-backup.timer /etc/systemd/system/
   ```

2. Check the installed units and reload systemd.

   ```bash
   systemd-analyze verify /etc/systemd/system/kamooni-backup{,-failure}.service      /etc/systemd/system/kamooni-backup.timer && systemctl daemon-reload
   ```

3. Exercise the approved failure email and confirm receipt in the operator mailbox.

   ```bash
   systemctl start kamooni-backup-failure.service
   ```

4. Run one authorized manual backup and confirm that the journal gives a full snapshot ID followed by a success message.

   ```bash
   systemctl start kamooni-backup.service && journalctl -u kamooni-backup.service -n 30 --no-pager
   ```

5. Restore that snapshot on an isolated host using the section below. After verifying recovery, enable the schedule on Genesis2.

   ```bash
   systemctl enable --now kamooni-backup.timer && systemctl list-timers kamooni-backup.timer --all
   ```

## Respond to a failure

Read the failed stage in `journalctl -u kamooni-backup.service -n 50` and check the failure unit's journal if mail failed. Both units also append status messages to `/var/log/kamooni-backup/backup.log`, owned by `root:root` with mode `0600`. The journal and file receive fixed status messages, generated run IDs and verified Restic IDs. Check the named source, available space or repository connectivity from the authorized host. Run the same service again after correcting the issue. If the log records a stored snapshot ID and then fails during retention, that completed snapshot is eligible for restore.

A failed upload can leave a `kamooni-pending` snapshot. Restic 0.16.4 can also leave the old pending snapshot alongside its daily replacement if it cannot delete the old ID during retagging. A run is eligible for restore only when its unique run tag identifies one snapshot with `kamooni-daily` and without `kamooni-pending`. The script fails and skips retention on an ambiguous daily run, including ambiguity left by a previous invocation.

With the service idle, inspect the failed run ID from the journal with `restic snapshots --host kamooni --tag RUN_ID`. Check the last good ID against the restore list below. After confirming the exact IDs belong to the failed run, use `restic forget FULL_FAILED_ID [FULL_OTHER_FAILED_ID]` with the repository credentials. The next successful run handles pruning.

## Monitor missed runs

Have existing monitoring run this read-only check on Genesis2 as a user with journal access. Run it at least hourly and alert on a nonzero exit or if the check cannot reach the host. The 28-hour window gives the daily run time to finish and detects a missed start even if the failure unit never ran.

```bash
(
  set -o pipefail
  journalctl -u kamooni-backup.service --since '28 hours ago' --no-pager -o cat |
    grep -E '^Kamooni backup succeeded kamooni-[0-9]{8}T[0-9]{6}Z\.[A-Za-z0-9]{8}\.$' >/dev/null
)
```

## Restore one complete snapshot

Use a disposable or replacement host with isolated storage, no production routes, blocked outbound mail/webhooks and no running Kamooni workers. Run as root in Bash with Docker and Restic installed. Put the off-server Restic credentials in mode-`0600` `restic.env` and `restic.pass` files in `/root/kamooni-backup-config/`.

1. List eligible snapshots and select the full ID for one run.

   ```bash
   set -a
   source /root/kamooni-backup-config/restic.env
   set +a
   export RESTIC_PASSWORD_FILE=/root/kamooni-backup-config/restic.pass
   eligible_snapshots() (
     set -o pipefail
     restic snapshots --host kamooni --json | python3 -I -c '
   from collections import Counter
   import json, re, sys
   snapshots = json.load(sys.stdin) or []
   tags = [set(s.get("tags") or []) for s in snapshots]
   runs = [{t for t in group if re.fullmatch(r"kamooni-\d{8}T\d{6}Z\.[A-Za-z0-9]{8}", t)}
           for group in tags]
   counts = Counter(t for group in runs for t in group)
   for snapshot, group, ids in zip(snapshots, tags, runs):
       if ("kamooni-daily" in group and "kamooni-pending" not in group
               and len(ids) == 1 and counts[next(iter(ids))] == 1):
           print(snapshot["id"], snapshot["time"])
   '
   )
   eligible_snapshots
   ```

2. Verify the chosen ID is eligible and restore it to a private directory. Keep using this shell for the remaining commands.

   ```bash
   umask 077
   read -r -p 'Full snapshot ID: ' snapshot_id
   restore_root=$(mktemp -d /var/tmp/kamooni-recovery.XXXXXXXX)
   eligible_snapshots |
     awk -v id="$snapshot_id" '$1 == id { found = 1 } END { exit !found }' &&
   restic restore --verify --target "$restore_root" "$snapshot_id" &&
   cat "$restore_root/set/runtime.txt" &&
   if [[ -f "$restore_root/set/manifest.txt" ]]; then
     cat "$restore_root/set/manifest.txt"
   fi
   ```

   **Server signing keys.** If the manifest says `server_did_signing_pair=absent`, the snapshot cannot restore the historical server signing pair or recover signing for the DID recorded in MongoDB. For older snapshots without a manifest, inspect `app-data.tar` for both nonempty server key files before relying on signing. Keep the original MongoDB server DID and leave the missing keys absent. Do not generate replacement signing keys during recovery.

3. Extract into separate fresh directories. Preserve the owners and modes before using the files as volume contents. Review the archived configuration under `config/` before copying it to the replacement host's paths. If the archive includes the documented `.env` symlink, inspect it with `readlink` and use the extracted `config/home/ubuntu/migration-export/.env` to restore the target file. Recreate the absolute link after placing the target at its original path.

   ```bash
   (
     set -e
     for name in app-data user-data minio config; do
       mkdir "$restore_root/$name"
       tar --numeric-owner --acls --xattrs --xattrs-include='*' -xpf "$restore_root/set/$name.tar" -C "$restore_root/$name"
     done
   )
   ```

4. Start the recorded MongoDB 7 image with an empty database directory, no network outside its container, and TTL disabled for validation.

   ```bash
   read -r -p 'Recorded MongoDB image reference (repository@digest): ' mongo_image
   mkdir "$restore_root/mongo-data" &&
   docker run -d --name kamooni-recovery-mongo --network none \
     --mount "type=bind,src=$restore_root/mongo-data,dst=/data/db" \
     --mount "type=bind,src=$restore_root/set/mongo,dst=/restore,readonly" \
     "$mongo_image" mongod --bind_ip 127.0.0.1 --setParameter ttlMonitorEnabled=false
   ```

   Once MongoDB is ready, restore the whole dump using the tools inside that image.

   ```bash
   docker exec kamooni-recovery-mongo mongorestore --host 127.0.0.1:27017 --gzip --stopOnError /restore
   ```

   Check app documents, indexes and admin users/roles. Before connecting an app, restart the recovered database with authentication enabled and verify a restored login.

5. Start the recorded MinIO image against the extracted data tree, including `.minio.sys`. Use a root-only `/root/kamooni-recovery-minio.env` with the recovered settings, including `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD`. Resolve dependencies such as external MinIO KMS keys from the recovery records.

   ```bash
   read -r -p 'Recorded MinIO image reference (repository@digest): ' minio_image
   docker run -d --name kamooni-recovery-minio -p 127.0.0.1:19000:9000 \
     --env-file /root/kamooni-recovery-minio.env \
     --mount "type=bind,src=$restore_root/minio,dst=/data" "$minio_image" server /data
   ```

   Check that all buckets are available, that representative public and private objects match, and that anonymous access to private and verification objects is denied. Use the extracted `app-data` for the app's `/circles` volume and `user-data` for its separate `/circles/users` volume.
6. Check that representative MongoDB DIDs resolve to their existing key files before testing login against the recorded application revision. Check a chat and a private attachment with a restored account. Investigate missing keys, messages or objects before a cutover. Keep recovered credentials and data restricted and remove rehearsal copies after verification.

## Synthetic rehearsal

Inside a disposable Ubuntu 24.04 container with external networking disabled, run the command below as root with MongoDB 7, MongoDB Database Tools, MinIO, Restic 0.16.4, and Python with `boto3` and `pymongo` installed. Use a read-only mount of the checkout and no Docker socket or credential mounts. The test creates its own MongoDB, source MinIO, separate S3 repository and failed-delete proxy on loopback. It creates synthetic files at the documented host paths inside the container. Docker mount discovery and email delivery use stubs.

```bash
python3 -B circles/scripts/kamooni-backup/test_backup.py -v
```

The private staging and timer/failure-unit design comes from Peerify. [Backup script](https://github.com/Social-Systems-Lab/peerify/blob/fbb9ca9a6ea6007fddff4566bbf4ea407dbfd58c/circles/scripts/backup/peerify-backup.sh) · [Daily timer](https://github.com/Social-Systems-Lab/peerify/blob/fbb9ca9a6ea6007fddff4566bbf4ea407dbfd58c/circles/scripts/backup/systemd/peerify-backup.timer)
