# Block 1 GCP Baseline (Terraform)

This stack provisions the Block 1 baseline:

- Cloud Run services: `nexum-web`, `nexum-api`
- Cloud SQL Postgres instance + database
- Service accounts split: `nexum-web-sa`, `nexum-api-sa`, `nexum-build-sa`
- Artifact Registry repository for container images
- Cloud Storage bucket for app assets
- Secret Manager placeholders for DB password and Firebase service account JSON

## Usage

```bash
cd infra/gcp/terraform
terraform init
terraform apply \
  -var="project_id=<gcp-project-id>" \
  -var="region=us-central1" \
  -var="web_image=us-central1-docker.pkg.dev/<gcp-project-id>/nexum/nexum-web:latest" \
  -var="api_image=us-central1-docker.pkg.dev/<gcp-project-id>/nexum/nexum-api:latest" \
  -var="firebase_project_id=<firebase-project-id>" \
  -var="supply_agent_mcp_url=https://<mcp-service>.run.app/mcp"
```

## Notes

- DB credentials should be injected from Secret Manager in production hardening.
- For demo, public ingress is enabled with membership-based authorization at API layer.
- Apply `infra/gcp/sql/001_profiles_external_auth.sql` after schema import to enable Firebase UID mapping.
