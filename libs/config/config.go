package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type RedisConfig struct {
	Addr          string
	EventsChannel string
	StatesChannel string
}

type MasterConfig struct {
	HTTPAddr                     string
	Redis                        RedisConfig
	SessionDisconnectGracePeriod time.Duration
	CloudflareAccess             CloudflareAccessConfig
}

type CloudflareAccessConfig struct {
	Enabled      bool
	TeamDomain   string
	Audience     string
	CertsURL     string
	TokenHeader  string
	TokenCookie  string
	JWKSCacheTTL time.Duration
	HTTPTimeout  time.Duration
}

type ControllerConfig struct {
	GRPCAddr      string
	Redis         RedisConfig
	SlaveGRPCPort string
}

type SlaveConfig struct {
	GRPCAddr              string
	ControllerGRPCTarget  string
	PodID                 string
	K8sPodName            string
	K8sPodUID             string
	PodIP                 string
	InitialRemainingTurns int32
}

func LoadMaster() (MasterConfig, error) {
	cfg := MasterConfig{
		HTTPAddr: envOrDefault("MASTER_HTTP_ADDR", ":8080"),
		Redis: RedisConfig{
			Addr:          envOrDefault("MASTER_REDIS_ADDR", "localhost:6379"),
			EventsChannel: envOrDefault("MASTER_REDIS_EVENTS_CHANNEL", "game.events"),
			StatesChannel: envOrDefault("MASTER_REDIS_STATES_CHANNEL", "slave.states"),
		},
		SessionDisconnectGracePeriod: envOrDefaultDuration(
			"MASTER_SESSION_DISCONNECT_GRACE_PERIOD",
			30*time.Second,
		),
		CloudflareAccess: CloudflareAccessConfig{
			Enabled:      envOrDefaultBool("MASTER_CLOUDFLARE_ACCESS_ENABLED", false),
			TeamDomain:   strings.TrimSpace(envOrDefault("MASTER_CLOUDFLARE_ACCESS_TEAM_DOMAIN", "")),
			Audience:     strings.TrimSpace(envOrDefault("MASTER_CLOUDFLARE_ACCESS_AUDIENCE", "")),
			CertsURL:     strings.TrimSpace(envOrDefault("MASTER_CLOUDFLARE_ACCESS_CERTS_URL", "")),
			TokenHeader:  envOrDefault("MASTER_CLOUDFLARE_ACCESS_TOKEN_HEADER", "Cf-Access-Jwt-Assertion"),
			TokenCookie:  envOrDefault("MASTER_CLOUDFLARE_ACCESS_TOKEN_COOKIE", "CF_Authorization"),
			JWKSCacheTTL: envOrDefaultDuration("MASTER_CLOUDFLARE_ACCESS_JWKS_CACHE_TTL", 5*time.Minute),
			HTTPTimeout:  envOrDefaultDuration("MASTER_CLOUDFLARE_ACCESS_HTTP_TIMEOUT", 5*time.Second),
		},
	}
	if err := validateRedis(cfg.Redis); err != nil {
		return MasterConfig{}, err
	}
	if cfg.SessionDisconnectGracePeriod < 0 {
		return MasterConfig{}, fmt.Errorf("MASTER_SESSION_DISCONNECT_GRACE_PERIOD must be greater than or equal to zero")
	}
	if err := validateCloudflareAccess(cfg.CloudflareAccess); err != nil {
		return MasterConfig{}, err
	}
	return cfg, nil
}

func LoadController() (ControllerConfig, error) {
	cfg := ControllerConfig{
		GRPCAddr: envOrDefault("CONTROLLER_GRPC_ADDR", ":50052"),
		Redis: RedisConfig{
			Addr:          envOrDefault("CONTROLLER_REDIS_ADDR", "localhost:6379"),
			EventsChannel: envOrDefault("CONTROLLER_REDIS_EVENTS_CHANNEL", "game.events"),
			StatesChannel: envOrDefault("CONTROLLER_REDIS_STATES_CHANNEL", "slave.states"),
		},
		SlaveGRPCPort: envOrDefault("CONTROLLER_SLAVE_GRPC_PORT", "50051"),
	}
	if cfg.GRPCAddr == "" {
		return ControllerConfig{}, fmt.Errorf("CONTROLLER_GRPC_ADDR is required")
	}
	if cfg.SlaveGRPCPort == "" {
		return ControllerConfig{}, fmt.Errorf("CONTROLLER_SLAVE_GRPC_PORT is required")
	}
	return cfg, validateRedis(cfg.Redis)
}

func LoadSlave() (SlaveConfig, error) {
	podID := envOrDefault("SLAVE_POD_ID", "")
	if podID == "" {
		hostname, err := os.Hostname()
		if err != nil {
			return SlaveConfig{}, fmt.Errorf("get hostname for SLAVE_POD_ID fallback: %w", err)
		}
		podID = hostname
	}

	cfg := SlaveConfig{
		GRPCAddr:              envOrDefault("SLAVE_GRPC_ADDR", ":50051"),
		ControllerGRPCTarget:  envOrDefault("SLAVE_CONTROLLER_GRPC_TARGET", "localhost:50052"),
		PodID:                 podID,
		K8sPodName:            envOrDefault("SLAVE_K8S_POD_NAME", "slave-service-0"),
		K8sPodUID:             envOrDefault("SLAVE_K8S_POD_UID", "slave-service-0-uid"),
		PodIP:                 envOrDefault("SLAVE_POD_IP", "127.0.0.1"),
		InitialRemainingTurns: envOrDefaultInt32("SLAVE_INITIAL_REMAINING_TURNS", 10),
	}
	if cfg.GRPCAddr == "" {
		return SlaveConfig{}, fmt.Errorf("SLAVE_GRPC_ADDR is required")
	}
	if cfg.ControllerGRPCTarget == "" {
		return SlaveConfig{}, fmt.Errorf("SLAVE_CONTROLLER_GRPC_TARGET is required")
	}
	if cfg.PodID == "" {
		return SlaveConfig{}, fmt.Errorf("SLAVE_POD_ID is required")
	}
	if cfg.K8sPodName == "" {
		return SlaveConfig{}, fmt.Errorf("SLAVE_K8S_POD_NAME is required")
	}
	if cfg.K8sPodUID == "" {
		return SlaveConfig{}, fmt.Errorf("SLAVE_K8S_POD_UID is required")
	}
	if cfg.PodIP == "" {
		return SlaveConfig{}, fmt.Errorf("SLAVE_POD_IP is required")
	}
	return cfg, nil
}

func validateRedis(cfg RedisConfig) error {
	if cfg.Addr == "" {
		return fmt.Errorf("redis address is required")
	}
	if cfg.EventsChannel == "" {
		return fmt.Errorf("redis events channel is required")
	}
	if cfg.StatesChannel == "" {
		return fmt.Errorf("redis states channel is required")
	}
	return nil
}

func validateCloudflareAccess(cfg CloudflareAccessConfig) error {
	if !cfg.Enabled {
		return nil
	}
	if cfg.TeamDomain == "" {
		return fmt.Errorf("MASTER_CLOUDFLARE_ACCESS_TEAM_DOMAIN is required when MASTER_CLOUDFLARE_ACCESS_ENABLED=true")
	}
	if cfg.Audience == "" {
		return fmt.Errorf("MASTER_CLOUDFLARE_ACCESS_AUDIENCE is required when MASTER_CLOUDFLARE_ACCESS_ENABLED=true")
	}
	if cfg.TokenHeader == "" {
		return fmt.Errorf("MASTER_CLOUDFLARE_ACCESS_TOKEN_HEADER is required when MASTER_CLOUDFLARE_ACCESS_ENABLED=true")
	}
	if cfg.TokenCookie == "" {
		return fmt.Errorf("MASTER_CLOUDFLARE_ACCESS_TOKEN_COOKIE is required when MASTER_CLOUDFLARE_ACCESS_ENABLED=true")
	}
	if cfg.JWKSCacheTTL <= 0 {
		return fmt.Errorf("MASTER_CLOUDFLARE_ACCESS_JWKS_CACHE_TTL must be greater than zero")
	}
	if cfg.HTTPTimeout <= 0 {
		return fmt.Errorf("MASTER_CLOUDFLARE_ACCESS_HTTP_TIMEOUT must be greater than zero")
	}
	return nil
}

func envOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func envOrDefaultInt32(key string, defaultValue int32) int32 {
	if value := os.Getenv(key); value != "" {
		var parsed int64
		_, err := fmt.Sscan(value, &parsed)
		if err == nil {
			return int32(parsed)
		}
	}
	return defaultValue
}

func envOrDefaultBool(key string, defaultValue bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return defaultValue
	}
	return parsed
}

func envOrDefaultDuration(key string, defaultValue time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return defaultValue
	}
	return parsed
}
