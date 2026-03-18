data "google_secret_manager_secret" "cloudflared_token" {
  secret_id = "cloudflared-token-secret"
}

data "google_secret_manager_secret" "cloudflare_access_team_domain" {
  secret_id = "cloudflare-access-team-domain-secret"
}

data "google_secret_manager_secret" "cloudflare_access_audience" {
  secret_id = "cloudflare-access-audience-secret"
}

# Grant the Secret Sync Kubernetes service account access only to the cloudflared token secret.
resource "google_secret_manager_secret_iam_member" "cloudflared_secret_sync_accessor" {
  secret_id = data.google_secret_manager_secret.cloudflared_token.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "principal://iam.googleapis.com/projects/${data.google_project.project.number}/locations/global/workloadIdentityPools/${var.project_id}.svc.id.goog/subject/ns/default/sa/cloudflared-secret-sync"
}

resource "google_secret_manager_secret_iam_member" "cloudflare_access_team_domain_secret_sync_accessor" {
  secret_id = data.google_secret_manager_secret.cloudflare_access_team_domain.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "principal://iam.googleapis.com/projects/${data.google_project.project.number}/locations/global/workloadIdentityPools/${var.project_id}.svc.id.goog/subject/ns/default/sa/cloudflared-secret-sync"
}

resource "google_secret_manager_secret_iam_member" "cloudflare_access_audience_secret_sync_accessor" {
  secret_id = data.google_secret_manager_secret.cloudflare_access_audience.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "principal://iam.googleapis.com/projects/${data.google_project.project.number}/locations/global/workloadIdentityPools/${var.project_id}.svc.id.goog/subject/ns/default/sa/cloudflared-secret-sync"
}

# Grant Cloud Build Service Account access to Secret Manager (for build-time secrets like Vite)
resource "google_project_iam_member" "cloudbuild_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cicd_build_sa.email}"
}
