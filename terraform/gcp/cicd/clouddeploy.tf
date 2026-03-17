# Cloud Deploy Target for GKE
resource "google_clouddeploy_target" "gke_target" {
  location    = var.region
  name        = "gke-production"
  description = "GKE Production Target"

  gke {
    cluster = "projects/${var.project_id}/locations/${var.region}/clusters/${var.gke_cluster_name}"
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
      profiles  = []
    }
  }
}
