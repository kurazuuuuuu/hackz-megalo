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
	Redis           RedisConfig
	SlaveGRPCTarget string
}

type SlaveConfig struct {
	GRPCAddr string
	PodID    string
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
		Redis: RedisConfig{
			Addr:          envOrDefault("CONTROLLER_REDIS_ADDR", "localhost:6379"),
			EventsChannel: envOrDefault("CONTROLLER_REDIS_EVENTS_CHANNEL", "game.events"),
			StatesChannel: envOrDefault("CONTROLLER_REDIS_STATES_CHANNEL", "slave.states"),
		},
		SlaveGRPCTarget: envOrDefault("CONTROLLER_SLAVE_GRPC_TARGET", "localhost:50051"),
	}
	if cfg.SlaveGRPCTarget == "" {
		return ControllerConfig{}, fmt.Errorf("CONTROLLER_SLAVE_GRPC_TARGET is required")
	}
	return cfg, validateRedis(cfg.Redis)
}

func LoadSlave() (SlaveConfig, error) {
	cfg := SlaveConfig{
		GRPCAddr: envOrDefault("SLAVE_GRPC_ADDR", ":50051"),
		PodID:    envOrDefault("SLAVE_POD_ID", "slave-1"),
	}
	if cfg.GRPCAddr == "" {
		return SlaveConfig{}, fmt.Errorf("SLAVE_GRPC_ADDR is required")
	}
	if cfg.PodID == "" {
		return SlaveConfig{}, fmt.Errorf("SLAVE_POD_ID is required")
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
