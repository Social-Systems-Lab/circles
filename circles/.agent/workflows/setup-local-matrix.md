---
description: Set up a local Matrix server (Synapse) for development
---

1. Generate the Synapse configuration:
```bash
docker-compose -f docker-compose.local.setup.yml up synapse_setup
```

2. Start the local services (Matrix, Postgres, MinIO, Mongo, Qdrant):
```bash
docker-compose -f docker-compose.local.yml up -d
```

3. Create a new Matrix user (replace `username` and `password` with your desired credentials):
```bash
docker-compose -f docker-compose.local.yml exec synapse register_new_matrix_user -u username -p password -a -c /data/homeserver.yaml http://localhost:8008
```

4. Update your `.env.local` file with the new credentials (if necessary) or log in via the application using these credentials.
