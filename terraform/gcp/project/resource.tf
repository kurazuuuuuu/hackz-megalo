resource "google_project_service" "gcp_services" {
  for_each = toset(var.gcp_services)

  project = var.project_id
  service = each.value

  # 意図しないAPI無効化による障害を防ぐため、Terraform管理外からの破棄時にAPIを無効化しないようにします
  disable_on_destroy = false
}
