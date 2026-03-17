package redis

import (
	"context"
	"testing"
	"time"

	miniredis "github.com/alicebob/miniredis/v2"

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
	payload := `{"slave_id":"slave-id-1","k8s_pod_name":"slave-service-0","k8s_pod_uid":"uid-1","pod_ip":"10.0.0.10","status":"SLAVE_STATUS_LIVE","death_reason":"DEATH_REASON_UNSPECIFIED","turns_lived":1,"remaining_turns":9,"observed_at":"2026-03-17T00:00:00Z","source":"controller-service"}`

	state, err := DecodeSlaveState(payload)
	if err != nil {
		t.Fatalf("DecodeSlaveState() error = %v", err)
	}

	if state.SlaveID != "slave-id-1" {
		t.Fatalf("SlaveID = %q, want %q", state.SlaveID, "slave-id-1")
	}
	if state.Status != domain.SlaveStatusLive {
		t.Fatalf("Status = %q, want %q", state.Status, domain.SlaveStatusLive)
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

func TestProtoRoundTripValues(t *testing.T) {
	state := domain.SlaveState{
		SlaveID:        "slave-id-1",
		K8sPodName:     "slave-service-0",
		K8sPodUID:      "uid-1",
		PodIP:          "10.0.0.10",
		Status:         domain.SlaveStatusLive,
		DeathReason:    domain.DeathReasonUnspecified,
		TurnsLived:     3,
		RemainingTurns: 7,
		ObservedAt:     time.Date(2026, 3, 17, 0, 0, 0, 0, time.UTC),
		Source:         "controller-service",
	}

	protoState := ToProtoSlaveState(state)
	got := FromProtoSlaveState(protoState, "controller-service")
	if got.SlaveID != state.SlaveID {
		t.Fatalf("SlaveID = %q, want %q", got.SlaveID, state.SlaveID)
	}
	if got.Status != state.Status {
		t.Fatalf("Status = %q, want %q", got.Status, state.Status)
	}
	if got.RemainingTurns != state.RemainingTurns {
		t.Fatalf("RemainingTurns = %d, want %d", got.RemainingTurns, state.RemainingTurns)
	}
}

func TestListAndGetSlaveStates(t *testing.T) {
	mr := miniredis.RunT(t)
	client := New(mr.Addr(), "game.events", "slave.states")
	t.Cleanup(func() { _ = client.Close() })

	ctx := context.Background()
	stateA := domain.SlaveState{
		SlaveID:        "slave-a",
		K8sPodName:     "slave-service-a",
		K8sPodUID:      "uid-a",
		PodIP:          "10.0.0.1",
		Status:         domain.SlaveStatusLive,
		DeathReason:    domain.DeathReasonUnspecified,
		TurnsLived:     1,
		RemainingTurns: 9,
		ObservedAt:     time.Now().UTC(),
		Source:         "controller-service",
	}
	stateB := domain.SlaveState{
		SlaveID:        "slave-b",
		K8sPodName:     "slave-service-b",
		K8sPodUID:      "uid-b",
		PodIP:          "10.0.0.2",
		Status:         domain.SlaveStatusTerminating,
		DeathReason:    domain.DeathReasonLifespan,
		TurnsLived:     10,
		RemainingTurns: 0,
		ObservedAt:     time.Now().UTC(),
		Source:         "controller-service",
	}

	if err := client.PublishSlaveState(ctx, stateA); err != nil {
		t.Fatalf("PublishSlaveState(stateA) error = %v", err)
	}
	if err := client.PublishSlaveState(ctx, stateB); err != nil {
		t.Fatalf("PublishSlaveState(stateB) error = %v", err)
	}

	states, err := client.ListSlaveStates(ctx)
	if err != nil {
		t.Fatalf("ListSlaveStates() error = %v", err)
	}
	if len(states) != 2 {
		t.Fatalf("len(states) = %d, want %d", len(states), 2)
	}

	got, err := client.GetSlaveState(ctx, "slave-b")
	if err != nil {
		t.Fatalf("GetSlaveState() error = %v", err)
	}
	if got.SlaveID != "slave-b" {
		t.Fatalf("SlaveID = %q, want %q", got.SlaveID, "slave-b")
	}
	if got.DeathReason != domain.DeathReasonLifespan {
		t.Fatalf("DeathReason = %q, want %q", got.DeathReason, domain.DeathReasonLifespan)
	}
}
