resource "terraform_data" "enable_secret_sync" {
  triggers_replace = [
    google_container_cluster.deploy.id,
    "60s"
  ]

  provisioner "local-exec" {
    command = "gcloud beta container clusters update ${var.gke_cluster_name} --project=${var.project_id} --location=${var.region} --enable-secret-sync --enable-secret-sync-rotation --secret-sync-rotation-interval=60s"
  }

  depends_on = [
    google_container_cluster.deploy
  ]
}
