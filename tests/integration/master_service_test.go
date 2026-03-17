//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/kurazuuuuuu/hackz-megalo/libs/domain"
)

type publishEventRequest struct {
	EventID   int32  `json:"event_id"`
	Seed      int64  `json:"seed"`
	TargetPod string `json:"target_pod"`
}

func TestMasterServiceTransportFlow(t *testing.T) {
	t.Parallel()

	baseURL := envOrDefault("MASTER_BASE_URL", "http://127.0.0.1:8080")
	wsURL := envOrDefault("MASTER_WS_URL", "ws://127.0.0.1:8080/ws")
	timeout := envDurationOrDefault("TEST_TIMEOUT_SECONDS", 10*time.Second)

	client := &http.Client{Timeout: timeout}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	healthReq, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/healthz", nil)
	if err != nil {
		t.Fatalf("build healthz request: %v", err)
	}

	healthResp, err := client.Do(healthReq)
	if err != nil {
		t.Fatalf("call %s/healthz: %v (is docker compose up running?)", baseURL, err)
	}
	defer healthResp.Body.Close()

	if healthResp.StatusCode != http.StatusOK {
		t.Fatalf("healthz status = %d, want %d", healthResp.StatusCode, http.StatusOK)
	}

	dialer := websocket.Dialer{HandshakeTimeout: timeout}
	wsConn, resp, err := dialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		if resp != nil {
			t.Fatalf("dial websocket %s: %v (status=%s)", wsURL, err, resp.Status)
		}
		t.Fatalf("dial websocket %s: %v", wsURL, err)
	}
	defer wsConn.Close()

	eventID := int32(time.Now().Unix()%1_000_000) + 1_000
	eventReq := publishEventRequest{
		EventID:   eventID,
		Seed:      time.Now().UnixNano(),
		TargetPod: "slave-1",
	}

	payload, err := json.Marshal(eventReq)
	if err != nil {
		t.Fatalf("marshal event request: %v", err)
	}

	postReq, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/events", bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("build events request: %v", err)
	}
	postReq.Header.Set("Content-Type", "application/json")

	postResp, err := client.Do(postReq)
	if err != nil {
		t.Fatalf("post %s/events: %v", baseURL, err)
	}
	defer postResp.Body.Close()

	if postResp.StatusCode != http.StatusAccepted {
		t.Fatalf("events status = %d, want %d", postResp.StatusCode, http.StatusAccepted)
	}

	var publishedEvent domain.Event
	if err := json.NewDecoder(postResp.Body).Decode(&publishedEvent); err != nil {
		t.Fatalf("decode events response: %v", err)
	}
	t.Logf("published event: %+v", publishedEvent)

	if publishedEvent.EventID != eventReq.EventID {
		t.Fatalf("published EventID = %d, want %d", publishedEvent.EventID, eventReq.EventID)
	}
	if publishedEvent.TargetPod != eventReq.TargetPod {
		t.Fatalf("published TargetPod = %q, want %q", publishedEvent.TargetPod, eventReq.TargetPod)
	}

	expectedStress := eventReq.EventID * 10
	readDeadline := time.Now().Add(timeout)
	if err := wsConn.SetReadDeadline(readDeadline); err != nil {
		t.Fatalf("set websocket deadline: %v", err)
	}

	for {
		var state domain.SlaveState
		if err := wsConn.ReadJSON(&state); err != nil {
			t.Fatalf("read websocket state before matching event %d: %v", eventReq.EventID, err)
		}
		t.Logf("received slave state: %+v", state)

		if state.PodID != eventReq.TargetPod {
			continue
		}
		if state.Stress != expectedStress {
			continue
		}

		if state.Status != "ready" {
			t.Fatalf("state Status = %q, want %q", state.Status, "ready")
		}
		if state.Source != "controller-service" {
			t.Fatalf("state Source = %q, want %q", state.Source, "controller-service")
		}
		if state.UpdatedAt.IsZero() {
			t.Fatalf("state UpdatedAt should not be zero")
		}

		return
	}
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envDurationOrDefault(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	seconds, err := strconv.Atoi(value)
	if err != nil || seconds <= 0 {
		panic(fmt.Sprintf("%s must be a positive integer in seconds", key))
	}

	return time.Duration(seconds) * time.Second
}
