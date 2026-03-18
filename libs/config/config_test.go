package config

import (
	"testing"
	"time"
)

func TestLoadMasterDefaults(t *testing.T) {
	t.Setenv("MASTER_HTTP_ADDR", "")
	t.Setenv("MASTER_REDIS_ADDR", "")
	t.Setenv("MASTER_REDIS_EVENTS_CHANNEL", "")
	t.Setenv("MASTER_REDIS_STATES_CHANNEL", "")
	t.Setenv("MASTER_SESSION_DISCONNECT_GRACE_PERIOD", "")
	t.Setenv("MASTER_CLOUDFLARE_ACCESS_ENABLED", "")
	t.Setenv("MASTER_CLOUDFLARE_ACCESS_TEAM_DOMAIN", "")
	t.Setenv("MASTER_CLOUDFLARE_ACCESS_AUDIENCE", "")
	t.Setenv("MASTER_CLOUDFLARE_ACCESS_CERTS_URL", "")
	t.Setenv("MASTER_CLOUDFLARE_ACCESS_TOKEN_HEADER", "")
	t.Setenv("MASTER_CLOUDFLARE_ACCESS_TOKEN_COOKIE", "")
	t.Setenv("MASTER_CLOUDFLARE_ACCESS_JWKS_CACHE_TTL", "")
	t.Setenv("MASTER_CLOUDFLARE_ACCESS_HTTP_TIMEOUT", "")

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
	if cfg.SessionDisconnectGracePeriod != 30*time.Second {
		t.Fatalf(
			"SessionDisconnectGracePeriod = %s, want %s",
			cfg.SessionDisconnectGracePeriod,
			30*time.Second,
		)
	}
	if cfg.CloudflareAccess.Enabled {
		t.Fatalf("CloudflareAccess.Enabled = %t, want false", cfg.CloudflareAccess.Enabled)
	}
	if cfg.CloudflareAccess.TokenHeader != "Cf-Access-Jwt-Assertion" {
		t.Fatalf("CloudflareAccess.TokenHeader = %q, want %q", cfg.CloudflareAccess.TokenHeader, "Cf-Access-Jwt-Assertion")
	}
	if cfg.CloudflareAccess.TokenCookie != "CF_Authorization" {
		t.Fatalf("CloudflareAccess.TokenCookie = %q, want %q", cfg.CloudflareAccess.TokenCookie, "CF_Authorization")
	}
}

func TestLoadMasterRejectsNegativeSessionDisconnectGracePeriod(t *testing.T) {
	t.Setenv("MASTER_SESSION_DISCONNECT_GRACE_PERIOD", "-1s")

	if _, err := LoadMaster(); err == nil {
		t.Fatal("LoadMaster() error = nil, want validation error")
	}
}

func TestLoadMasterCloudflareAccessEnabledRequiresFields(t *testing.T) {
	t.Setenv("MASTER_CLOUDFLARE_ACCESS_ENABLED", "true")
	t.Setenv("MASTER_CLOUDFLARE_ACCESS_TEAM_DOMAIN", "")
	t.Setenv("MASTER_CLOUDFLARE_ACCESS_AUDIENCE", "")

	if _, err := LoadMaster(); err == nil {
		t.Fatal("LoadMaster() error = nil, want validation error")
	}
}

func TestLoadMasterCloudflareAccessEnabled(t *testing.T) {
	t.Setenv("MASTER_CLOUDFLARE_ACCESS_ENABLED", "true")
	t.Setenv("MASTER_CLOUDFLARE_ACCESS_TEAM_DOMAIN", "https://example.cloudflareaccess.com")
	t.Setenv("MASTER_CLOUDFLARE_ACCESS_AUDIENCE", "aud-tag")
	t.Setenv("MASTER_CLOUDFLARE_ACCESS_JWKS_CACHE_TTL", "2m")
	t.Setenv("MASTER_CLOUDFLARE_ACCESS_HTTP_TIMEOUT", "4s")

	cfg, err := LoadMaster()
	if err != nil {
		t.Fatalf("LoadMaster() error = %v", err)
	}
	if !cfg.CloudflareAccess.Enabled {
		t.Fatal("CloudflareAccess.Enabled = false, want true")
	}
	if cfg.CloudflareAccess.TeamDomain != "https://example.cloudflareaccess.com" {
		t.Fatalf("TeamDomain = %q, want %q", cfg.CloudflareAccess.TeamDomain, "https://example.cloudflareaccess.com")
	}
	if cfg.CloudflareAccess.Audience != "aud-tag" {
		t.Fatalf("Audience = %q, want %q", cfg.CloudflareAccess.Audience, "aud-tag")
	}
}

func TestLoadControllerDefaults(t *testing.T) {
	t.Setenv("CONTROLLER_GRPC_ADDR", "")
	t.Setenv("CONTROLLER_SLAVE_GRPC_PORT", "")

	cfg, err := LoadController()
	if err != nil {
		t.Fatalf("LoadController() unexpectedly errored: %v", err)
	}
	if cfg.SlaveGRPCPort != "50051" {
		t.Fatalf("SlaveGRPCPort = %q, want %q", cfg.SlaveGRPCPort, "50051")
	}
	if cfg.GRPCAddr != ":50052" {
		t.Fatalf("GRPCAddr = %q, want %q", cfg.GRPCAddr, ":50052")
	}
}

func TestLoadSlaveDefaults(t *testing.T) {
	cfg, err := LoadSlave()
	if err != nil {
		t.Fatalf("LoadSlave() error = %v", err)
	}

	if cfg.ControllerGRPCTarget != "localhost:50052" {
		t.Fatalf("ControllerGRPCTarget = %q, want %q", cfg.ControllerGRPCTarget, "localhost:50052")
	}
	if cfg.InitialRemainingTurns != 10 {
		t.Fatalf("InitialRemainingTurns = %d, want %d", cfg.InitialRemainingTurns, 10)
	}
}
