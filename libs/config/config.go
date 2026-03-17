package config

import (
	"fmt"
	"os"
)

type RedisConfig struct {
	Addr          string
	EventsChannel string
	StatesChannel string
}

type MasterConfig struct {
	HTTPAddr string
	Redis    RedisConfig
}

type ControllerConfig struct {
	GRPCAddr        string
	Redis           RedisConfig
	SlaveGRPCTarget string
}

type SlaveConfig struct {
	GRPCAddr              string
	ControllerGRPCTarget  string
	PodID                 string
	PodCount              int32
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
	}
	return cfg, validateRedis(cfg.Redis)
}

func LoadController() (ControllerConfig, error) {
	cfg := ControllerConfig{
		GRPCAddr: envOrDefault("CONTROLLER_GRPC_ADDR", ":50052"),
		Redis: RedisConfig{
			Addr:          envOrDefault("CONTROLLER_REDIS_ADDR", "localhost:6379"),
			EventsChannel: envOrDefault("CONTROLLER_REDIS_EVENTS_CHANNEL", "game.events"),
			StatesChannel: envOrDefault("CONTROLLER_REDIS_STATES_CHANNEL", "slave.states"),
		},
		SlaveGRPCTarget: envOrDefault("CONTROLLER_SLAVE_GRPC_TARGET", "localhost:50051"),
	}
	if cfg.GRPCAddr == "" {
		return ControllerConfig{}, fmt.Errorf("CONTROLLER_GRPC_ADDR is required")
	}
	if cfg.SlaveGRPCTarget == "" {
		return ControllerConfig{}, fmt.Errorf("CONTROLLER_SLAVE_GRPC_TARGET is required")
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

	podCount := envOrDefaultInt32("SLAVE_POD_COUNT", 20)
	if podCount <= 0 {
		podCount = 1
	}

	cfg := SlaveConfig{
		GRPCAddr:              envOrDefault("SLAVE_GRPC_ADDR", ":50051"),
		ControllerGRPCTarget:  envOrDefault("SLAVE_CONTROLLER_GRPC_TARGET", "localhost:50052"),
		PodID:                 podID,
		PodCount:              podCount,
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
