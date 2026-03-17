## 1. Implementation
 - [x] 1.1 Add OpenSpec delta for single-Pod slave runtime and controller-issued shutdown notifications
- [x] 1.2 Refactor `slave-service` to model exactly one Pod per process
- [x] 1.3 Update controller event routing to target a specific slave Pod from Redis state
- [x] 1.4 Add controller-side shutdown notification after terminal death so Kubernetes can restart the Pod
- [x] 1.5 Update configuration, compose wiring, and tests for the single-Pod runtime
- [x] 1.6 Validate with Go tests and OpenSpec validation, then mark tasks complete
