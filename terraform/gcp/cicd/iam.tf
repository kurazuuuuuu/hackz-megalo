# Automatically fetch the project number to construct the default Cloud Build Service Account
data "google_project" "project" {
  project_id = var.project_id
}

locals {
  cloudbuild_sa            = "${data.google_project.project.number}@cloudbuild.gserviceaccount.com"
  cloudbuild_service_agent = "service-${data.google_project.project.number}@gcp-sa-cloudbuild.iam.gserviceaccount.com"
}

# Custom Service Account for GKE Nodes (since default compute SA might not exist)
resource "google_service_account" "gke_nodes_sa" {
  account_id   = "gke-nodes-sa"
  display_name = "GKE Nodes Service Account"
}

# Grant GKE Nodes SA necessary permissions (Logging, Monitoring, etc.)
resource "google_project_iam_member" "gke_nodes_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.gke_nodes_sa.email}"
}

resource "google_project_iam_member" "gke_nodes_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.gke_nodes_sa.email}"
}

resource "google_project_iam_member" "gke_nodes_monitoring_viewer" {
  project = var.project_id
  role    = "roles/monitoring.viewer"
  member  = "serviceAccount:${google_service_account.gke_nodes_sa.email}"
}

resource "google_project_iam_member" "gke_nodes_metadata_writer" {
  project = var.project_id
  role    = "roles/stackdriver.resourceMetadata.writer"
  member  = "serviceAccount:${google_service_account.gke_nodes_sa.email}"
}

# IAM bindings for Cloud Build SA to push to Artifact Registry
resource "google_project_iam_member" "cloudbuild_artifactregistry_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${local.cloudbuild_sa}"
}

# IAM bindings for Cloud Build SA to create Cloud Deploy releases
resource "google_project_iam_member" "cloudbuild_deploy_releaser" {
  project = var.project_id
  role    = "roles/clouddeploy.releaser"
  member  = "serviceAccount:${local.cloudbuild_sa}"
}

# IAM bindings for Cloud Build SA to access GKE (needed during deploy)
resource "google_project_iam_member" "cloudbuild_container_developer" {
  project = var.project_id
  role    = "roles/container.developer"
  member  = "serviceAccount:${local.cloudbuild_sa}"
}

# Service Account User role allows Cloud Build to impersonate compute service accounts if needed by Deploy
resource "google_project_iam_member" "cloudbuild_sa_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${local.cloudbuild_sa}"
}

# IAM binding for Cloud Build Service Agent to access Secret Manager (needed for GitHub Connection)
resource "google_project_iam_member" "cloudbuild_service_agent_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${local.cloudbuild_service_agent}"
}
