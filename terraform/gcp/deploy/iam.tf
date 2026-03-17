# Automatically fetch the project number to construct the default Cloud Build Service Account
data "google_project" "project" {
  project_id = var.project_id
}

locals {
  cloudbuild_sa            = "${data.google_project.project.number}@cloudbuild.gserviceaccount.com"
  cloudbuild_service_agent = "service-${data.google_project.project.number}@gcp-sa-cloudbuild.iam.gserviceaccount.com"
}

# User-managed service account for Cloud Build trigger execution.
resource "google_service_account" "cicd_build_sa" {
  account_id   = "cicd-build-sa"
  display_name = "CICD Build Service Account"
}

# Autopilot nodes still need an explicit service account in projects where the
# default Compute Engine service account is absent or disabled.
resource "google_service_account" "gke_nodes_sa" {
  account_id   = "gke-nodes-sa"
  display_name = "GKE Nodes Service Account"
}

resource "google_project_iam_member" "gke_nodes_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.gke_nodes_sa.email}"
}

resource "google_project_iam_member" "gke_nodes_default_node_sa" {
  project = var.project_id
  role    = "roles/container.defaultNodeServiceAccount"
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

resource "google_project_iam_member" "gke_nodes_artifactregistry_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.gke_nodes_sa.email}"
}

# IAM bindings for Cloud Build SA to push to Artifact Registry
resource "google_project_iam_member" "cloudbuild_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.cicd_build_sa.email}"
}

# IAM bindings for Cloud Build SA to push to Artifact Registry
resource "google_project_iam_member" "cloudbuild_artifactregistry_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.cicd_build_sa.email}"
}

# IAM bindings for Cloud Build SA to create Cloud Deploy releases
resource "google_project_iam_member" "cloudbuild_deploy_releaser" {
  project = var.project_id
  role    = "roles/clouddeploy.releaser"
  member  = "serviceAccount:${google_service_account.cicd_build_sa.email}"
}

# Cloud Deploy execution needs the runner role on the chosen execution service account.
resource "google_project_iam_member" "clouddeploy_job_runner" {
  project = var.project_id
  role    = "roles/clouddeploy.jobRunner"
  member  = "serviceAccount:${google_service_account.cicd_build_sa.email}"
}

# IAM bindings for Cloud Build SA to access GKE (needed during deploy)
resource "google_project_iam_member" "cloudbuild_container_developer" {
  project = var.project_id
  role    = "roles/container.developer"
  member  = "serviceAccount:${google_service_account.cicd_build_sa.email}"
}

# Service Account User role allows Cloud Build to impersonate compute service accounts if needed by Deploy
resource "google_project_iam_member" "cloudbuild_sa_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.cicd_build_sa.email}"
}

# Allow Cloud Build to mint tokens for the user-managed build service account.
resource "google_service_account_iam_member" "cicd_build_sa_token_creator" {
  service_account_id = google_service_account.cicd_build_sa.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${local.cloudbuild_service_agent}"
}

# Cloud Deploy must be allowed to impersonate the execution service account.
resource "google_service_account_iam_member" "cicd_build_sa_clouddeploy_act_as" {
  service_account_id = google_service_account.cicd_build_sa.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-clouddeploy.iam.gserviceaccount.com"
}

# IAM binding for Cloud Build Service Agent to access Secret Manager (needed for GitHub Connection)
resource "google_project_iam_member" "cloudbuild_service_agent_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${local.cloudbuild_service_agent}"
}
