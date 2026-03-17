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
