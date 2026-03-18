# single-pod-slave-runtime Specification

## Purpose
TBD - created by archiving change update-single-pod-slave-lifecycle. Update Purpose after archive.
## Requirements
### Requirement: One Slave Process Represents One Pod
The system SHALL treat each `slave-service` process as exactly one Kubernetes Pod instance.

#### Scenario: Slave starts
- **WHEN** a `slave-service` instance starts
- **THEN** it initializes state for exactly one Pod and registers exactly one slave identity

### Requirement: Controller Routes Events To The Target Pod
The system SHALL make `controller-service` dispatch gameplay events only to the targeted slave Pod.

#### Scenario: Targeted event dispatch
- **WHEN** an event targets a specific Pod during an active session
- **THEN** `controller-service` resolves the target Pod from active Redis state and sends the event only to that Pod's slave endpoint

### Requirement: Controller Shuts Down Gone Slave Processes
The system SHALL make `controller-service` notify the real `slave-service` process to exit after that Pod becomes gone.

#### Scenario: Pod reaches gone state
- **WHEN** a slave state update transitions to `SLAVE_STATUS_GONE`
- **THEN** `controller-service` sends a shutdown request to the corresponding `slave-service`
- **AND** Kubernetes restarts the Pod according to its workload policy

