## ADDED Requirements

### Requirement: Redis-Based Backend Coordination
The system SHALL use Redis as the shared coordination layer between `master-service` and `controller-service`.

#### Scenario: Master publishes an event
- **WHEN** `master-service` receives an event from an external caller
- **THEN** it stores the event in Redis and publishes a Redis notification for controllers

#### Scenario: Controller publishes a slave state update
- **WHEN** `controller-service` receives a state update from a slave
- **THEN** it stores the updated slave state in Redis and publishes a Redis notification for masters

### Requirement: Controller to Slave gRPC
The system SHALL allow `controller-service` to execute a minimal gRPC request against `slave-service`.

#### Scenario: Controller dispatches an event to a slave
- **WHEN** `controller-service` consumes an event notification from Redis
- **THEN** it calls `slave-service` over gRPC with the event payload

#### Scenario: Slave returns its current state
- **WHEN** `slave-service` handles the gRPC request
- **THEN** it returns an acknowledgement and the slave's current state

### Requirement: Local Development and Build Workflow
The system SHALL support local Go development with Air and local container workflows with Docker Compose.

#### Scenario: Local service development
- **WHEN** a developer starts a backend service with Air
- **THEN** the service reloads from the Go source in this repository

#### Scenario: Local image build
- **WHEN** a developer runs `docker compose -f build-compose.yml build`
- **THEN** Docker builds images for `master-service`, `controller-service`, and `slave-service`
