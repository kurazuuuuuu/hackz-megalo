## ADDED Requirements
### Requirement: Production Redis Infrastructure
The deployment infrastructure SHALL provision a managed Redis instance for production workloads in the deploy VPC.

#### Scenario: Provision production Redis
- **WHEN** the deploy Terraform stack is applied
- **THEN** it creates a MemoryStore for Redis instance attached to the deploy VPC through Private Service Access

### Requirement: Production Redis Endpoint Injection
The deployment infrastructure SHALL publish the production Redis endpoint into the GKE cluster without hardcoding the address in production manifests.

#### Scenario: Inject Redis endpoint into workloads
- **WHEN** the deploy Terraform stack is applied
- **THEN** it creates a Kubernetes ConfigMap containing the managed Redis address and port
- **AND** production backend workloads read their Redis address from that ConfigMap
