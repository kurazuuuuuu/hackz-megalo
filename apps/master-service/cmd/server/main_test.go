package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	miniredis "github.com/alicebob/miniredis/v2"
	"github.com/gorilla/websocket"

	"github.com/kurazuuuuuu/hackz-megalo/libs/domain"
	redislayer "github.com/kurazuuuuuu/hackz-megalo/libs/infra/redis"
)

func TestHandleListSlaveStates(t *testing.T) {
	server := newTestMasterServer(t)
	ctx := context.Background()
	createActiveSession(t, server, "session-1")

	err := server.redisClient.PublishSlaveState(ctx, domain.SlaveState{
		SessionID:      "session-1",
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
	createActiveSession(t, server, "session-1")

	err := server.redisClient.PublishSlaveState(ctx, domain.SlaveState{
		SessionID:      "session-1",
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
	createActiveSession(t, server, "session-1")

	body := bytes.NewBufferString(`{"event_id":7,"seed":99,"target_pod":"slave-1"}`)
	req := httptest.NewRequest(http.MethodPost, "/internal/events", body)
	rec := httptest.NewRecorder()

	server.handlePublishEvent(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusAccepted)
	}

	var event domain.Event
	if err := json.Unmarshal(rec.Body.Bytes(), &event); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if event.SessionID != "session-1" {
		t.Fatalf("SessionID = %q, want %q", event.SessionID, "session-1")
	}
}

func TestHandleGetActiveSessionMetrics(t *testing.T) {
	server := newTestMasterServer(t)
	createActiveSession(t, server, "session-1")

	_, err := server.redisClient.UpdateSessionMetrics(context.Background(), "session-1", func(metrics domain.SessionMetrics) domain.SessionMetrics {
		metrics.LiveSlaves = 3
		metrics.GoneSlaves = 1
		return metrics
	})
	if err != nil {
		t.Fatalf("UpdateSessionMetrics() error = %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/internal/session/metrics", nil)
	rec := httptest.NewRecorder()

	server.handleGetActiveSessionMetrics(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var metrics domain.SessionMetrics
	if err := json.Unmarshal(rec.Body.Bytes(), &metrics); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if metrics.LiveSlaves != 3 {
		t.Fatalf("LiveSlaves = %d, want %d", metrics.LiveSlaves, 3)
	}
	if metrics.GoneSlaves != 1 {
		t.Fatalf("GoneSlaves = %d, want %d", metrics.GoneSlaves, 1)
	}
}

func TestHandleClientMessageUpdatesSlaveStateToGone(t *testing.T) {
	server := newTestMasterServer(t)
	createActiveSession(t, server, "session-1")

	err := server.redisClient.PublishSlaveState(context.Background(), domain.SlaveState{
		SessionID:      "session-1",
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
	if _, err := server.redisClient.UpdateSessionMetrics(context.Background(), "session-1", func(metrics domain.SessionMetrics) domain.SessionMetrics {
		metrics.LiveSlaves = 1
		return metrics
	}); err != nil {
		t.Fatalf("UpdateSessionMetrics() error = %v", err)
	}

	payload := []byte(`{"type":"pod_state_update","session_id":"session-1","slave_id":"slave-1","status":"SLAVE_STATUS_GONE","death_reason":"DEATH_REASON_POD_DOWN"}`)
	if err := server.handleClientMessage(context.Background(), "session-1", payload); err != nil {
		t.Fatalf("handleClientMessage() error = %v", err)
	}

	state, err := server.redisClient.GetSlaveState(context.Background(), "session-1", "slave-1")
	if err != nil {
		t.Fatalf("GetSlaveState() error = %v", err)
	}
	if state.Status != domain.SlaveStatusGone {
		t.Fatalf("Status = %q, want %q", state.Status, domain.SlaveStatusGone)
	}
	if state.Source != "frontend-webxr" {
		t.Fatalf("Source = %q, want %q", state.Source, "frontend-webxr")
	}

	metrics, err := server.redisClient.GetSessionMetrics(context.Background(), "session-1")
	if err != nil {
		t.Fatalf("GetSessionMetrics() error = %v", err)
	}
	if metrics.LiveSlaves != 0 {
		t.Fatalf("LiveSlaves = %d, want 0", metrics.LiveSlaves)
	}
	if metrics.GoneSlaves != 1 {
		t.Fatalf("GoneSlaves = %d, want 1", metrics.GoneSlaves)
	}
}

func TestHandleClientMessageRejectsUnsupportedStatus(t *testing.T) {
	server := newTestMasterServer(t)
	createActiveSession(t, server, "session-1")

	payload := []byte(`{"type":"pod_state_update","session_id":"session-1","slave_id":"slave-1","status":"SLAVE_STATUS_LIVE","death_reason":"DEATH_REASON_POD_DOWN"}`)
	if err := server.handleClientMessage(context.Background(), "session-1", payload); err == nil {
		t.Fatal("handleClientMessage() error = nil, want unsupported status")
	}
}

func TestMarkAllSlavesGone(t *testing.T) {
	server := newTestMasterServer(t)
	createActiveSession(t, server, "session-1")

	for i := 0; i < 2; i++ {
		err := server.redisClient.PublishSlaveState(context.Background(), domain.SlaveState{
			SessionID:      "session-1",
			SlaveID:        "slave-" + string(rune('1'+i)),
			K8sPodName:     "slave-service-" + string(rune('0'+i)),
			K8sPodUID:      "uid-" + string(rune('1'+i)),
			PodIP:          "10.0.0.1" + string(rune('0'+i)),
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
	}
	if _, err := server.redisClient.UpdateSessionMetrics(context.Background(), "session-1", func(metrics domain.SessionMetrics) domain.SessionMetrics {
		metrics.LiveSlaves = 2
		return metrics
	}); err != nil {
		t.Fatalf("UpdateSessionMetrics() error = %v", err)
	}

	if err := server.markAllSlavesGone(context.Background(), "session-1"); err != nil {
		t.Fatalf("markAllSlavesGone() error = %v", err)
	}

	states, err := server.redisClient.ListSlaveStates(context.Background(), "session-1")
	if err != nil {
		t.Fatalf("ListSlaveStates() error = %v", err)
	}
	if len(states) != 2 {
		t.Fatalf("len(states) = %d, want 2", len(states))
	}
	for _, state := range states {
		if state.Status != domain.SlaveStatusGone {
			t.Fatalf("Status = %q, want %q", state.Status, domain.SlaveStatusGone)
		}
		if state.DeathReason != domain.DeathReasonProcessDown {
			t.Fatalf("DeathReason = %q, want %q", state.DeathReason, domain.DeathReasonProcessDown)
		}
	}

	metrics, err := server.redisClient.GetSessionMetrics(context.Background(), "session-1")
	if err != nil {
		t.Fatalf("GetSessionMetrics() error = %v", err)
	}
	if metrics.LiveSlaves != 0 {
		t.Fatalf("LiveSlaves = %d, want 0", metrics.LiveSlaves)
	}
	if metrics.GoneSlaves != 2 {
		t.Fatalf("GoneSlaves = %d, want 2", metrics.GoneSlaves)
	}
}

func TestWebSocketSessionLifecycleAndSingleClient(t *testing.T) {
	server := newTestMasterServer(t)

	upgrader := websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		sessionMeta, resumed, ok := server.tryBeginSessionConnection()
		if !ok {
			http.Error(w, "active session already exists", http.StatusConflict)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			if resumed {
				server.handleConnectionClosed(sessionMeta.SessionID, false)
			} else {
				server.abortPendingSession()
			}
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if !resumed {
			sessionMeta, err = server.startSession(r.Context())
			if err != nil {
				server.abortPendingSession()
				_ = conn.Close()
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			server.commitSession(sessionMeta)
		}

		server.hub.add(conn)
		explicitDisconnect := false
		defer func() {
			server.hub.remove(conn)
			server.handleConnectionClosed(sessionMeta.SessionID, explicitDisconnect)
		}()

		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				explicitDisconnect = websocket.IsCloseError(err, websocketExplicitDisconnectCode)
				return
			}
		}
	})

	ts := httptest.NewServer(mux)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"
	firstConn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		if resp != nil {
			t.Fatalf("Dial(first) error = %v (status=%s)", err, resp.Status)
		}
		t.Fatalf("Dial(first) error = %v", err)
	}

	activeSessionID := ""
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		activeSessionID, err = server.redisClient.GetActiveSessionID(context.Background())
		if err == nil {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if activeSessionID == "" {
		t.Fatalf("GetActiveSessionID() error = %v", err)
	}
	if activeSessionID == "" {
		t.Fatalf("active session should not be empty")
	}

	_, resp, err = websocket.DefaultDialer.Dial(wsURL, nil)
	if err == nil {
		t.Fatalf("Dial(second) error = nil, want conflict")
	}
	if resp == nil || resp.StatusCode != http.StatusConflict {
		t.Fatalf("second response status = %v, want %d", resp, http.StatusConflict)
	}

	if err := firstConn.WriteControl(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
		time.Now().Add(time.Second),
	); err != nil {
		t.Fatalf("WriteControl(normal close) error = %v", err)
	}
	if err := firstConn.Close(); err != nil {
		t.Fatalf("Close(first) error = %v", err)
	}

	deadline = time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		activeSessionID, err = server.redisClient.GetActiveSessionID(context.Background())
		if err == nil && activeSessionID == server.currentSessionID() && activeSessionID != "" {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if activeSessionID == "" {
		t.Fatal("active session should remain during disconnect grace")
	}

	resumedConn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		if resp != nil {
			t.Fatalf("Dial(resume) error = %v (status=%s)", err, resp.Status)
		}
		t.Fatalf("Dial(resume) error = %v", err)
	}

	if got := server.currentSessionID(); got != activeSessionID {
		t.Fatalf("currentSessionID() = %q, want %q", got, activeSessionID)
	}

	if err := resumedConn.WriteControl(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(websocketExplicitDisconnectCode, "session_end"),
		time.Now().Add(time.Second),
	); err != nil {
		t.Fatalf("WriteControl(explicit close) error = %v", err)
	}
	if err := resumedConn.Close(); err != nil {
		t.Fatalf("Close(resume) error = %v", err)
	}

	deadline = time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := server.redisClient.GetActiveSessionID(context.Background()); err != nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("active session should be cleaned up after explicit websocket close")
}

func TestWithCORSAddsHeadersAndOptions(t *testing.T) {
	handler := withCORS(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/events", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, "*")
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); got != "GET, POST, OPTIONS" {
		t.Fatalf("Access-Control-Allow-Methods = %q, want %q", got, "GET, POST, OPTIONS")
	}

	optionsReq := httptest.NewRequest(http.MethodOptions, "/events", nil)
	optionsRec := httptest.NewRecorder()
	handler.ServeHTTP(optionsRec, optionsReq)
	if optionsRec.Code != http.StatusNoContent {
		t.Fatalf("OPTIONS status = %d, want %d", optionsRec.Code, http.StatusNoContent)
	}
}

func newTestMasterServer(t *testing.T) *masterServer {
	t.Helper()

	mr := miniredis.RunT(t)
	client := redislayer.New(mr.Addr(), "game.events", "slave.states")
	t.Cleanup(func() { _ = client.Close() })

	return &masterServer{
		redisClient:                  client,
		hub:                          newWebsocketHub(),
		sessionDisconnectGracePeriod: 100 * time.Millisecond,
	}
}

func createActiveSession(t *testing.T, server *masterServer, sessionID string) {
	t.Helper()

	err := server.redisClient.CreateSession(context.Background(), domain.SessionMeta{
		SessionID: sessionID,
		StartedAt: time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("CreateSession() error = %v", err)
	}
	server.mu.Lock()
	server.sessionID = sessionID
	server.sessionMeta = domain.SessionMeta{
		SessionID: sessionID,
		StartedAt: time.Now().UTC(),
	}
	server.mu.Unlock()
}
