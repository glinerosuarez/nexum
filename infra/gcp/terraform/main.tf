module "web_sa" {
  source       = "./modules/service_account"
  project_id   = var.project_id
  account_id   = "nexum-web-sa"
  display_name = "Nexum Web Runtime"
  roles = [
    "roles/run.invoker",
    "roles/secretmanager.secretAccessor",
  ]
}

module "api_sa" {
  source       = "./modules/service_account"
  project_id   = var.project_id
  account_id   = "nexum-api-sa"
  display_name = "Nexum API Runtime"
  roles = [
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
    "roles/storage.objectAdmin",
  ]
}

module "build_sa" {
  source       = "./modules/service_account"
  project_id   = var.project_id
  account_id   = "nexum-build-sa"
  display_name = "Nexum Build Deployer"
  roles = [
    "roles/run.admin",
    "roles/artifactregistry.writer",
    "roles/iam.serviceAccountUser",
    "roles/secretmanager.secretAccessor",
  ]
}

module "cloud_sql" {
  source         = "./modules/cloud_sql"
  project_id     = var.project_id
  region         = var.region
  instance_name  = var.db_instance_name
  database_name  = var.db_name
  database_version = "POSTGRES_15"
}

resource "google_storage_bucket" "app_assets" {
  name                        = "${var.project_id}-nexum-assets"
  project                     = var.project_id
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false
}

resource "google_artifact_registry_repository" "containers" {
  project       = var.project_id
  location      = var.region
  repository_id = "nexum"
  description   = "Container images for Nexum web/api services"
  format        = "DOCKER"
}

resource "google_secret_manager_secret" "firebase_service_account" {
  secret_id = "firebase-service-account"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "db_password" {
  secret_id = "db-pass"
  replication {
    auto {}
  }
}

module "api_service" {
  source          = "./modules/cloud_run_service"
  project_id      = var.project_id
  region          = var.region
  name            = "nexum-api"
  image           = var.api_image
  service_account = module.api_sa.email
  ingress         = "INGRESS_TRAFFIC_ALL"
  env = {
    FIREBASE_PROJECT_ID        = var.firebase_project_id
    CLOUD_SQL_INSTANCE         = module.cloud_sql.connection_name
    DB_NAME                    = var.db_name
    SUPPLY_AGENT_MCP_URL       = var.supply_agent_mcp_url
    SUPPLY_AGENT_MCP_REQUIRED  = var.supply_agent_mcp_required
    SUPPLY_AGENT_MCP_TIMEOUT_MS = "90000"
  }
}

module "web_service" {
  source          = "./modules/cloud_run_service"
  project_id      = var.project_id
  region          = var.region
  name            = "nexum-web"
  image           = var.web_image
  service_account = module.web_sa.email
  ingress         = "INGRESS_TRAFFIC_ALL"
  env = {
    NEXUM_API_BASE_URL = module.api_service.uri
  }
}

output "web_url" {
  value = module.web_service.uri
}

output "api_url" {
  value = module.api_service.uri
}
