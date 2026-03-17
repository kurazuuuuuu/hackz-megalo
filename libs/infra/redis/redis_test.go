package redis

import (
	"testing"
	"time"

	"github.com/kurazuuuuuu/hackz-megalo/libs/domain"
)

func TestDecodeEvent(t *testing.T) {
	payload := `{"event_id":3,"seed":42,"target_pod":"slave-1","source":"master-service","created_at":"2026-03-17T00:00:00Z"}`

	event, err := DecodeEvent(payload)
	if err != nil {
		t.Fatalf("DecodeEvent() error = %v", err)
	}

	if event.EventID != 3 {
		t.Fatalf("EventID = %d, want %d", event.EventID, 3)
	}
	if event.TargetPod != "slave-1" {
		t.Fatalf("TargetPod = %q, want %q", event.TargetPod, "slave-1")
	}
}

func TestDecodeSlaveState(t *testing.T) {
	payload := `{"pod_id":"slave-1","status":"ready","stress":10,"updated_at":"2026-03-17T00:00:00Z","source":"controller-service"}`

	state, err := DecodeSlaveState(payload)
	if err != nil {
		t.Fatalf("DecodeSlaveState() error = %v", err)
	}

	if state.PodID != "slave-1" {
		t.Fatalf("PodID = %q, want %q", state.PodID, "slave-1")
	}
	if state.Status != "ready" {
		t.Fatalf("Status = %q, want %q", state.Status, "ready")
	}
}

func TestEncodeRoundTripValues(t *testing.T) {
	now := time.Date(2026, 3, 17, 0, 0, 0, 0, time.UTC)
	event := domain.Event{
		EventID:   8,
		Seed:      99,
		TargetPod: "slave-2",
		Source:    "master-service",
		CreatedAt: now,
	}

	payload, err := marshal(event)
	if err != nil {
		t.Fatalf("marshal() error = %v", err)
	}

	got, err := DecodeEvent(payload)
	if err != nil {
		t.Fatalf("DecodeEvent() error = %v", err)
	}
	if got.CreatedAt.IsZero() {
		t.Fatalf("CreatedAt should not be zero")
	}
}
