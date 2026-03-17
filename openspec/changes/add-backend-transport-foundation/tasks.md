## 1. Implementation
- [x] 1.1 Add OpenSpec delta for backend transport foundation
- [x] 1.2 Implement shared config, Redis, domain, and gRPC server libraries under `libs/`
- [x] 1.3 Add `controller -> slave` proto and generated Go bindings
- [x] 1.4 Implement minimal `master-service` with HTTP entrypoint and Redis publish/subscribe
- [x] 1.5 Implement minimal `controller-service` with Redis subscription and slave gRPC client
- [x] 1.6 Implement minimal `slave-service` with gRPC server
- [x] 1.7 Add Air configs and per-service Dockerfiles
- [x] 1.8 Add `build-compose.yml` and runtime `compose.yml`
- [x] 1.9 Validate with OpenSpec, Go tests, and compose build
