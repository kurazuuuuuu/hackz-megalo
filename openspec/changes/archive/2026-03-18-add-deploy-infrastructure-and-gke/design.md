## Context
The repository currently splits infrastructure across `terraform/gcp/project`, `terraform/gcp/secret_manager`, and `terraform/gcp/deploy`. The deployment stack owns Cloud Build, Artifact Registry, Cloud Deploy, and the GKE target. We also need the deployment target cluster itself to be defined in Terraform.

## Goals
- Rename the deployment stack to match its broader responsibility
- Provision a minimal but functional GKE Autopilot cluster for deployment
- Keep the Cloud Deploy pipeline pointed at the managed cluster

## Non-Goals
- Re-architect application manifests or service topology
- Optimize for production scale or high availability beyond the minimum workable cluster
- Split the deployment stack into multiple environments

## Decisions
- Use `deploy` as the new Terraform boundary name for build/release/cluster management
- Keep the cluster footprint intentionally small by using GKE Autopilot instead of a manually managed node pool
- Preserve the existing Cloud Build and Cloud Deploy workflow, only changing the infrastructure it targets

## Migration Notes
- Update local paths, README references, and any scripts that point at the old deployment path
- Keep provider/state changes isolated so the rename and the new cluster can be applied together without changing application code
