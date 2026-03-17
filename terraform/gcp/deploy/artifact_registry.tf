resource "google_artifact_registry_repository" "hackz_megalo_repo" {
  location      = var.region
  repository_id = "hackz-megalo-repo"
  description   = "Docker repository for Hackz Megalo applications"
  format        = "DOCKER"

  docker_config {
    immutable_tags = false
  }
}
