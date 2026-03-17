# Cloud Storage bucket for Cloud Deploy release staging.
resource "google_storage_bucket" "clouddeploy_staging" {
  name                        = "${var.project_id}-clouddeploy-staging"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false
}

resource "google_storage_bucket_iam_member" "clouddeploy_staging_build_sa" {
  bucket = google_storage_bucket.clouddeploy_staging.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cicd_build_sa.email}"
}

resource "google_storage_bucket_iam_member" "clouddeploy_staging_build_sa_viewer" {
  bucket = google_storage_bucket.clouddeploy_staging.name
  role   = "roles/storage.bucketViewer"
  member = "serviceAccount:${google_service_account.cicd_build_sa.email}"
}

resource "google_storage_bucket_iam_member" "clouddeploy_staging_service_agent" {
  bucket = google_storage_bucket.clouddeploy_staging.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-clouddeploy.iam.gserviceaccount.com"
}

# Cloud Deploy Target for GKE
resource "google_clouddeploy_target" "gke_target" {
  location    = var.region
  name        = "gke-production"
  description = "GKE Production Target"

  gke {
    cluster = google_container_cluster.deploy.id
  }

  execution_configs {
    usages = ["RENDER", "DEPLOY"]

    service_account = google_service_account.cicd_build_sa.email
  }
}

# Cloud Deploy Pipelines for each app
resource "google_clouddeploy_delivery_pipeline" "delivery_pipeline" {
  for_each = toset(local.apps)

  location    = var.region
  name        = "${each.key}-pipeline"
  description = "Delivery pipeline for ${each.key}"

  serial_pipeline {
    stages {
      target_id = google_clouddeploy_target.gke_target.target_id
      profiles  = ["production"]
    }
  }
}
