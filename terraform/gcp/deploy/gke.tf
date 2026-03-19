# Minimal VPC for the managed GKE cluster.
resource "google_compute_network" "deploy" {
  name                    = "deploy-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "deploy" {
  name                     = "deploy-subnet"
  region                   = var.region
  network                  = google_compute_network.deploy.self_link
  ip_cidr_range            = "10.20.0.0/20"
  private_ip_google_access = true

  secondary_ip_range = [
    {
      range_name    = "deploy-pods"
      ip_cidr_range = "10.24.0.0/14"
    },
    {
      range_name    = "deploy-services"
      ip_cidr_range = "10.28.0.0/20"
    }
  ]
}

# Autopilot cluster for Cloud Deploy targets.
resource "google_container_cluster" "deploy" {
  name                = var.gke_cluster_name
  location            = var.region
  network             = google_compute_network.deploy.self_link
  subnetwork          = google_compute_subnetwork.deploy.self_link
  enable_autopilot    = true
  deletion_protection = false

  ip_allocation_policy {
    cluster_secondary_range_name  = "deploy-pods"
    services_secondary_range_name = "deploy-services"
  }

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }
}
