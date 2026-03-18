resource "google_compute_global_address" "redis_private_service_access" {
  name          = "deploy-redis-private-service-access"
  address_type  = "INTERNAL"
  purpose       = "VPC_PEERING"
  prefix_length = 16
  network       = google_compute_network.deploy.id
}

resource "google_service_networking_connection" "redis_private_service_access" {
  network                 = google_compute_network.deploy.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.redis_private_service_access.name]
}

resource "google_redis_instance" "production" {
  name               = var.redis_instance_name
  region             = var.region
  location_id        = var.redis_location_id
  tier               = "BASIC"
  memory_size_gb     = var.redis_memory_size_gb
  connect_mode       = "PRIVATE_SERVICE_ACCESS"
  authorized_network = google_compute_network.deploy.id
  reserved_ip_range  = google_compute_global_address.redis_private_service_access.name

  depends_on = [
    google_service_networking_connection.redis_private_service_access
  ]
}

resource "kubernetes_config_map_v1" "redis_config" {
  metadata {
    name      = "redis-config"
    namespace = "default"
  }

  data = {
    REDIS_ADDR = "${google_redis_instance.production.host}:${google_redis_instance.production.port}"
  }

  depends_on = [
    google_container_cluster.deploy,
    google_redis_instance.production
  ]
}
