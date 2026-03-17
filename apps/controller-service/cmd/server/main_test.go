package main

import (
	"context"
	"testing"
	"time"

	miniredis "github.com/alicebob/miniredis/v2"

	"github.com/kurazuuuuuu/hackz-megalo/libs/domain"
	redislayer "github.com/kurazuuuuuu/hackz-megalo/libs/infra/redis"
)

func TestApplySessionMetricsForStateChange(t *testing.T) {
	mr := miniredis.RunT(t)
	client := redislayer.New(mr.Addr(), "game.events", "slave.states")
	t.Cleanup(func() { _ = client.Close() })

	ctx := context.Background()
	if err := client.CreateSession(ctx, domain.SessionMeta{
		SessionID: "session-1",
		StartedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatalf("CreateSession() error = %v", err)
	}
	if _, err := client.UpdateSessionMetrics(ctx, "session-1", func(metrics domain.SessionMetrics) domain.SessionMetrics {
		metrics.LiveSlaves = 1
		return metrics
	}); err != nil {
		t.Fatalf("UpdateSessionMetrics() setup error = %v", err)
	}

	err := applySessionMetricsForStateChange(ctx, client, "session-1", domain.SlaveState{
		Status: domain.SlaveStatusLive,
	}, domain.SlaveState{
		Status: domain.SlaveStatusTerminating,
	})
	if err != nil {
		t.Fatalf("applySessionMetricsForStateChange() error = %v", err)
	}

	metrics, err := client.GetSessionMetrics(ctx, "session-1")
	if err != nil {
		t.Fatalf("GetSessionMetrics() error = %v", err)
	}
	if metrics.LiveSlaves != 0 {
		t.Fatalf("LiveSlaves = %d, want %d", metrics.LiveSlaves, 0)
	}
	if metrics.GoneSlaves != 1 {
		t.Fatalf("GoneSlaves = %d, want %d", metrics.GoneSlaves, 1)
	}
}

func TestResolveTargetSlaveState(t *testing.T) {
	mr := miniredis.RunT(t)
	client := redislayer.New(mr.Addr(), "game.events", "slave.states")
	t.Cleanup(func() { _ = client.Close() })

	ctx := context.Background()
	if err := client.CreateSession(ctx, domain.SessionMeta{
		SessionID: "session-1",
		StartedAt: time.Now().UTC(),
	}); err != nil {
		t.Fatalf("CreateSession() error = %v", err)
	}
	if err := client.PublishSlaveState(ctx, domain.SlaveState{
		SessionID:  "session-1",
		SlaveID:    "slave-id-1",
		K8sPodName: "slave-service-0",
		PodIP:      "10.0.0.10",
		Status:     domain.SlaveStatusLive,
		ObservedAt: time.Now().UTC(),
		Source:     "controller-service",
	}); err != nil {
		t.Fatalf("PublishSlaveState() error = %v", err)
	}

	state, err := resolveTargetSlaveState(ctx, client, "session-1", "slave-id-1")
	if err != nil {
		t.Fatalf("resolveTargetSlaveState() error = %v", err)
	}
	if state.PodIP != "10.0.0.10" {
		t.Fatalf("PodIP = %q, want %q", state.PodIP, "10.0.0.10")
	}
}

func TestIsGoneTransition(t *testing.T) {
	if !isGoneTransition(domain.SlaveState{Status: domain.SlaveStatusTerminating}, domain.SlaveState{Status: domain.SlaveStatusGone}) {
		t.Fatalf("isGoneTransition() = false, want true")
	}
	if isGoneTransition(domain.SlaveState{Status: domain.SlaveStatusGone}, domain.SlaveState{Status: domain.SlaveStatusGone}) {
		t.Fatalf("isGoneTransition() = true, want false for repeated gone state")
	}
}

func TestObservedStateStoreRememberReturnsPreviousState(t *testing.T) {
	store := newObservedStateStore()
	first := domain.SlaveState{
		SessionID: "session-1",
		SlaveID:   "slave-1",
		Status:    domain.SlaveStatusLive,
	}
	second := domain.SlaveState{
		SessionID: "session-1",
		SlaveID:   "slave-1",
		Status:    domain.SlaveStatusGone,
	}

	previous := store.remember(first)
	if previous.Status != domain.SlaveStatusUnspecified {
		t.Fatalf("previous.Status = %q, want unspecified", previous.Status)
	}

	previous = store.remember(second)
	if previous.Status != domain.SlaveStatusLive {
		t.Fatalf("previous.Status = %q, want %q", previous.Status, domain.SlaveStatusLive)
	}
}
