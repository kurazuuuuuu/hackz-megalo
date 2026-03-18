## 1. Implementation
- [x] 1.1 Add an OpenSpec delta for Cloud Build Docker cache reuse
- [x] 1.2 Update the Terraform Cloud Build trigger to persist and reuse per-app Buildx registry caches
- [x] 1.3 Narrow Docker build contexts and `.dockerignore` so cache invalidation stays scoped to the changed app
- [x] 1.4 Validate with `openspec validate --strict`, Terraform formatting checks, and `docker compose build` for deployable services
