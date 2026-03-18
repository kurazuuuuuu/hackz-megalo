## ADDED Requirements
### Requirement: Deploy stack boundary
The system SHALL manage build, release, and cluster-deployment infrastructure under a `deploy` Terraform boundary rather than a `cicd` boundary.

#### Scenario: Terraform path is renamed
- **WHEN** a maintainer works with the deployment Terraform stack
- **THEN** the stack lives under a `deploy` directory and the old `cicd` path is no longer the primary entry point

### Requirement: Minimal managed GKE cluster
The system SHALL provision a Terraform-managed GKE Autopilot cluster suitable for Cloud Deploy with the smallest practical resource footprint for the environment.

#### Scenario: Cluster is available for delivery
- **WHEN** Cloud Deploy targets the production cluster
- **THEN** the cluster exists, is managed by Terraform, and uses Autopilot so the workload can run without a manually managed node pool

### Requirement: Cloud Deploy target uses managed cluster
The system SHALL configure Cloud Deploy to deploy to the Terraform-managed GKE cluster.

#### Scenario: Release targets the cluster
- **WHEN** a deployment release is created
- **THEN** Cloud Deploy resolves a GKE target backed by the managed cluster instead of an unmanaged placeholder
