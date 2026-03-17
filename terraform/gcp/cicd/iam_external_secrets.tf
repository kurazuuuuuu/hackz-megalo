# Grant GKE Compute Service Account access to Secret Manager
# Assuming the GKE cluster uses the default Compute Engine SA.
# If a custom SA is used for the node pool, update this accordingly.

resource "google_project_iam_member" "gke_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.gke_nodes_sa.email}"
}

# Grant Cloud Build Service Account access to Secret Manager (for build-time secrets like Vite)
resource "google_project_iam_member" "cloudbuild_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${data.google_project.project.number}@cloudbuild.gserviceaccount.com"
}
