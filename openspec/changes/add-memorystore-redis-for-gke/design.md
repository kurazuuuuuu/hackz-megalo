## Context
The deploy stack already owns the VPC, GKE Autopilot cluster, Cloud Build, and Cloud Deploy resources. Production manifests still point backend services at `redis-master:6379`, which only exists in the local overlay.

## Goals
- Add a Terraform-managed production Redis endpoint on GCP
- Keep application configuration contract unchanged
- Avoid hardcoding the production Redis IP in manifests

## Non-Goals
- Introduce Redis AUTH or TLS in this change
- Replace the local development Redis flow
- Change Redis channel naming or application behavior

## Decisions
- Use MemoryStore for Redis with `BASIC` tier for minimal cost
- Use Private Service Access on the existing deploy VPC
- Expose the MemoryStore endpoint to workloads through a Terraform-managed Kubernetes ConfigMap
- Patch only the production overlay so base manifests remain environment-agnostic

## Risks / Trade-offs
- `BASIC` has no failover support; this is acceptable for the current phase
- The Kubernetes provider depends on cluster reachability during Terraform apply
- Private Service Access requires an additional API and allocated peering range
