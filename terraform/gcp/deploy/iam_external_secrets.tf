# Grant the Autopilot node service account access to Secret Manager for ESO.
resource "google_project_iam_member" "gke_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.gke_nodes_sa.email}"
}

# Grant Cloud Build Service Account access to Secret Manager (for build-time secrets like Vite)
resource "google_project_iam_member" "cloudbuild_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cicd_build_sa.email}"
}
