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
	payload := `{"session_id":"session-1","slave_id":"slave-id-1","k8s_pod_name":"slave-service-0","k8s_pod_uid":"uid-1","pod_ip":"10.0.0.10","status":"SLAVE_STATUS_LIVE","death_reason":"DEATH_REASON_UNSPECIFIED","turns_lived":1,"remaining_turns":9,"observed_at":"2026-03-17T00:00:00Z","source":"controller-service"}`

	state, err := DecodeSlaveState(payload)
	if err != nil {
		t.Fatalf("DecodeSlaveState() error = %v", err)
	}

	if state.SlaveID != "slave-id-1" {
		t.Fatalf("SlaveID = %q, want %q", state.SlaveID, "slave-id-1")
	}
	if state.SessionID != "session-1" {
		t.Fatalf("SessionID = %q, want %q", state.SessionID, "session-1")
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
		SessionID:      "session-1",
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
	if got.SessionID != state.SessionID {
		t.Fatalf("SessionID = %q, want %q", got.SessionID, state.SessionID)
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
	session := domain.SessionMeta{
		SessionID: "session-1",
		StartedAt: time.Now().UTC(),
	}
	if err := client.CreateSession(ctx, session); err != nil {
		t.Fatalf("CreateSession() error = %v", err)
	}

	stateA := domain.SlaveState{
		SessionID:      session.SessionID,
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
		SessionID:      session.SessionID,
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

	states, err := client.ListSlaveStates(ctx, session.SessionID)
	if err != nil {
		t.Fatalf("ListSlaveStates() error = %v", err)
	}
	if len(states) != 2 {
		t.Fatalf("len(states) = %d, want %d", len(states), 2)
	}

	got, err := client.GetSlaveState(ctx, session.SessionID, "slave-b")
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

func TestSessionLifecycleAndCleanup(t *testing.T) {
	mr := miniredis.RunT(t)
	client := New(mr.Addr(), "game.events", "slave.states")
	t.Cleanup(func() { _ = client.Close() })

	ctx := context.Background()
	session := domain.SessionMeta{
		SessionID: "session-2",
		StartedAt: time.Now().UTC(),
	}

	if err := client.CreateSession(ctx, session); err != nil {
		t.Fatalf("CreateSession() error = %v", err)
	}

	activeSessionID, err := client.GetActiveSessionID(ctx)
	if err != nil {
		t.Fatalf("GetActiveSessionID() error = %v", err)
	}
	if activeSessionID != session.SessionID {
		t.Fatalf("active session = %q, want %q", activeSessionID, session.SessionID)
	}

	if _, err := client.UpdateSessionMetrics(ctx, session.SessionID, func(metrics domain.SessionMetrics) domain.SessionMetrics {
		metrics.LiveSlaves = 2
		return metrics
	}); err != nil {
		t.Fatalf("UpdateSessionMetrics() error = %v", err)
	}

	if err := client.PublishSlaveState(ctx, domain.SlaveState{
		SessionID:      session.SessionID,
		SlaveID:        "slave-c",
		K8sPodName:     "slave-service-c",
		K8sPodUID:      "uid-c",
		PodIP:          "10.0.0.3",
		Status:         domain.SlaveStatusLive,
		DeathReason:    domain.DeathReasonUnspecified,
		TurnsLived:     2,
		RemainingTurns: 8,
		ObservedAt:     time.Now().UTC(),
		Source:         "controller-service",
	}); err != nil {
		t.Fatalf("PublishSlaveState() error = %v", err)
	}

	if err := client.DeleteSession(ctx, session.SessionID); err != nil {
		t.Fatalf("DeleteSession() error = %v", err)
	}

	if _, err := client.GetActiveSessionID(ctx); err == nil {
		t.Fatalf("GetActiveSessionID() error = nil, want not found")
	}
	if _, err := client.GetSessionMeta(ctx, session.SessionID); err == nil {
		t.Fatalf("GetSessionMeta() error = nil, want not found")
	}
	if _, err := client.GetSessionMetrics(ctx, session.SessionID); err == nil {
		t.Fatalf("GetSessionMetrics() error = nil, want not found")
	}
	states, err := client.ListSlaveStates(ctx, session.SessionID)
	if err != nil {
		t.Fatalf("ListSlaveStates() after delete error = %v", err)
	}
	if len(states) != 0 {
		t.Fatalf("len(states) = %d, want %d", len(states), 0)
	}
}
