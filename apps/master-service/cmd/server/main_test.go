package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	miniredis "github.com/alicebob/miniredis/v2"

	"github.com/kurazuuuuuu/hackz-megalo/libs/domain"
	redislayer "github.com/kurazuuuuuu/hackz-megalo/libs/infra/redis"
)

func TestHandleListSlaveStates(t *testing.T) {
	server := newTestMasterServer(t)
	ctx := context.Background()

	err := server.redisClient.PublishSlaveState(ctx, domain.SlaveState{
		SlaveID:        "slave-1",
		K8sPodName:     "slave-service-0",
		K8sPodUID:      "uid-1",
		PodIP:          "10.0.0.10",
		Status:         domain.SlaveStatusLive,
		DeathReason:    domain.DeathReasonUnspecified,
		TurnsLived:     1,
		RemainingTurns: 9,
		ObservedAt:     time.Now().UTC(),
		Source:         "controller-service",
	})
	if err != nil {
		t.Fatalf("PublishSlaveState() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/internal/slaves", nil)
	rec := httptest.NewRecorder()

	server.handleListSlaveStates(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var states []domain.SlaveState
	if err := json.Unmarshal(rec.Body.Bytes(), &states); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if len(states) != 1 {
		t.Fatalf("len(states) = %d, want %d", len(states), 1)
	}
	if states[0].SlaveID != "slave-1" {
		t.Fatalf("SlaveID = %q, want %q", states[0].SlaveID, "slave-1")
	}
}

func TestHandleGetSlaveState(t *testing.T) {
	server := newTestMasterServer(t)
	ctx := context.Background()

	err := server.redisClient.PublishSlaveState(ctx, domain.SlaveState{
		SlaveID:        "slave-2",
		K8sPodName:     "slave-service-1",
		K8sPodUID:      "uid-2",
		PodIP:          "10.0.0.11",
		Status:         domain.SlaveStatusLive,
		DeathReason:    domain.DeathReasonUnspecified,
		TurnsLived:     2,
		RemainingTurns: 8,
		ObservedAt:     time.Now().UTC(),
		Source:         "controller-service",
	})
	if err != nil {
		t.Fatalf("PublishSlaveState() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/internal/slaves/slave-2", nil)
	rec := httptest.NewRecorder()

	server.handleGetSlaveState(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var state domain.SlaveState
	if err := json.Unmarshal(rec.Body.Bytes(), &state); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if state.SlaveID != "slave-2" {
		t.Fatalf("SlaveID = %q, want %q", state.SlaveID, "slave-2")
	}
}

func TestHandlePublishEvent(t *testing.T) {
	server := newTestMasterServer(t)

	body := bytes.NewBufferString(`{"event_id":7,"seed":99,"target_pod":"slave-1"}`)
	req := httptest.NewRequest(http.MethodPost, "/internal/events", body)
	rec := httptest.NewRecorder()

	server.handlePublishEvent(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusAccepted)
	}
}

func newTestMasterServer(t *testing.T) *masterServer {
	t.Helper()

	mr := miniredis.RunT(t)
	client := redislayer.New(mr.Addr(), "game.events", "slave.states")
	t.Cleanup(func() { _ = client.Close() })

	return &masterServer{
		redisClient: client,
		hub:         newWebsocketHub(),
	}
}
