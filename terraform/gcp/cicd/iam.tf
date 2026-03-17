# Automatically fetch the project number to construct the default Cloud Build Service Account
data "google_project" "project" {
  project_id = var.project_id
}

locals {
  cloudbuild_sa = "${data.google_project.project.number}@cloudbuild.gserviceaccount.com"
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
