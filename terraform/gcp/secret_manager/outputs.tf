output "secret_ids" {
  description = "The IDs of the created secrets"
  value = {
    for k, v in google_secret_manager_secret.secret : k => v.id
  }
}
