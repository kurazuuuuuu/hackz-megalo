package config

import "testing"

func TestLoadMasterDefaults(t *testing.T) {
	t.Setenv("MASTER_HTTP_ADDR", "")
	t.Setenv("MASTER_REDIS_ADDR", "")
	t.Setenv("MASTER_REDIS_EVENTS_CHANNEL", "")
	t.Setenv("MASTER_REDIS_STATES_CHANNEL", "")

	cfg, err := LoadMaster()
	if err != nil {
		t.Fatalf("LoadMaster() error = %v", err)
	}

	if cfg.HTTPAddr != ":8080" {
		t.Fatalf("HTTPAddr = %q, want %q", cfg.HTTPAddr, ":8080")
	}
	if cfg.Redis.Addr != "localhost:6379" {
		t.Fatalf("Redis.Addr = %q, want %q", cfg.Redis.Addr, "localhost:6379")
	}
}

func TestLoadControllerRequiresTarget(t *testing.T) {
	t.Setenv("CONTROLLER_SLAVE_GRPC_TARGET", "")

	cfg, err := LoadController()
	if err != nil {
		t.Fatalf("LoadController() unexpectedly errored: %v", err)
	}
	if cfg.SlaveGRPCTarget != "localhost:50051" {
		t.Fatalf("SlaveGRPCTarget = %q, want %q", cfg.SlaveGRPCTarget, "localhost:50051")
	}
}
