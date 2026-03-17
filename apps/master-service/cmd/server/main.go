package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/kurazuuuuuu/hackz-megalo/libs/config"
	"github.com/kurazuuuuuu/hackz-megalo/libs/domain"
	redislayer "github.com/kurazuuuuuu/hackz-megalo/libs/infra/redis"
)

type websocketHub struct {
	mu    sync.Mutex
	conns map[*websocket.Conn]struct{}
}

func newWebsocketHub() *websocketHub {
	return &websocketHub{
		conns: make(map[*websocket.Conn]struct{}),
	}
}

func (h *websocketHub) add(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.conns[conn] = struct{}{}
}

func (h *websocketHub) remove(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.conns, conn)
	_ = conn.Close()
}

func (h *websocketHub) broadcast(v any) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for conn := range h.conns {
		if err := conn.WriteJSON(v); err != nil {
			_ = conn.Close()
			delete(h.conns, conn)
		}
	}
}

type publishEventRequest struct {
	EventID   int32  `json:"event_id"`
	Seed      int64  `json:"seed"`
	TargetPod string `json:"target_pod"`
}

type masterServer struct {
	redisClient *redislayer.Client
	hub         *websocketHub
	mu          sync.Mutex
	sessionID   string
}

func (s *masterServer) tryReserveSessionSlot() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.sessionID != "" {
		return false
	}
	s.sessionID = "pending"
	return true
}

func (s *masterServer) startSession(ctx context.Context) (domain.SessionMeta, error) {
	meta := domain.SessionMeta{
		SessionID: uuid.NewString(),
		StartedAt: time.Now().UTC(),
	}
	if err := s.redisClient.CreateSession(ctx, meta); err != nil {
		return domain.SessionMeta{}, fmt.Errorf("create session: %w", err)
	}

	s.mu.Lock()
	s.sessionID = meta.SessionID
	s.mu.Unlock()

	return meta, nil
}

func (s *masterServer) endSession(ctx context.Context, sessionID string) error {
	if strings.TrimSpace(sessionID) == "" {
		return nil
	}
	if err := s.redisClient.DeleteSession(ctx, sessionID); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

func (s *masterServer) releaseSessionSlot(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if sessionID == "" || s.sessionID == sessionID || s.sessionID == "pending" {
		s.sessionID = ""
	}
}

func (s *masterServer) currentSessionID() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sessionID
}

func main() {
	cfg, err := config.LoadMaster()
	if err != nil {
		log.Fatalf("load master config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	redisClient := redislayer.New(cfg.Redis.Addr, cfg.Redis.EventsChannel, cfg.Redis.StatesChannel)
	defer func() {
		if err := redisClient.Close(); err != nil {
			log.Printf("close redis: %v", err)
		}
	}()

	if err := redisClient.Ping(ctx); err != nil {
		log.Fatalf("ping redis: %v", err)
	}

	serverState := &masterServer{
		redisClient: redisClient,
		hub:         newWebsocketHub(),
	}
	go serverState.subscribeStateUpdates(ctx)

	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/events", serverState.handlePublishEvent)
	mux.HandleFunc("/internal/events", serverState.handlePublishEvent)
	mux.HandleFunc("/internal/session", serverState.handleGetActiveSession)
	mux.HandleFunc("/internal/session/metrics", serverState.handleGetActiveSessionMetrics)
	mux.HandleFunc("/internal/slaves", serverState.handleListSlaveStates)
	mux.HandleFunc("/internal/slaves/", serverState.handleGetSlaveState)
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		if !serverState.tryReserveSessionSlot() {
			http.Error(w, "active session already exists", http.StatusConflict)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			serverState.releaseSessionSlot("")
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		sessionMeta, err := serverState.startSession(r.Context())
		if err != nil {
			serverState.releaseSessionSlot("")
			_ = conn.Close()
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		serverState.hub.add(conn)
		defer func() {
			serverState.hub.remove(conn)
			if err := serverState.endSession(context.Background(), sessionMeta.SessionID); err != nil {
				log.Printf("end session %s: %v", sessionMeta.SessionID, err)
			}
			serverState.releaseSessionSlot(sessionMeta.SessionID)
		}()

		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	})

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("shutdown http server: %v", err)
		}
	}()

	log.Printf("master-service listening on %s", cfg.HTTPAddr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("listen and serve: %v", err)
	}
}

func (s *masterServer) handlePublishEvent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req publishEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	sessionID, err := s.redisClient.GetActiveSessionID(r.Context())
	if err != nil {
		http.Error(w, "active session not found", http.StatusConflict)
		return
	}

	event := domain.Event{
		EventID:   req.EventID,
		Seed:      req.Seed,
		TargetPod: req.TargetPod,
		SessionID: sessionID,
		Source:    "master-service",
		CreatedAt: time.Now().UTC(),
	}

	if err := s.redisClient.PublishEvent(r.Context(), event); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(event)
}

func (s *masterServer) handleGetActiveSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionID, err := s.redisClient.GetActiveSessionID(r.Context())
	if err != nil {
		http.Error(w, "active session not found", http.StatusNotFound)
		return
	}

	meta, err := s.redisClient.GetSessionMeta(r.Context(), sessionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_ = json.NewEncoder(w).Encode(meta)
}

func (s *masterServer) handleGetActiveSessionMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionID, err := s.redisClient.GetActiveSessionID(r.Context())
	if err != nil {
		http.Error(w, "active session not found", http.StatusNotFound)
		return
	}

	metrics, err := s.redisClient.GetSessionMetrics(r.Context(), sessionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_ = json.NewEncoder(w).Encode(metrics)
}

func (s *masterServer) handleListSlaveStates(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionID, err := s.redisClient.GetActiveSessionID(r.Context())
	if err != nil {
		_ = json.NewEncoder(w).Encode([]domain.SlaveState{})
		return
	}

	states, err := s.redisClient.ListSlaveStates(r.Context(), sessionID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_ = json.NewEncoder(w).Encode(states)
}

func (s *masterServer) handleGetSlaveState(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	slaveID := strings.TrimPrefix(r.URL.Path, "/internal/slaves/")
	if slaveID == "" || slaveID == r.URL.Path {
		http.Error(w, "slave_id is required", http.StatusBadRequest)
		return
	}

	sessionID, err := s.redisClient.GetActiveSessionID(r.Context())
	if err != nil {
		http.Error(w, "active session not found", http.StatusNotFound)
		return
	}

	state, err := s.redisClient.GetSlaveState(r.Context(), sessionID, slaveID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, fmt.Sprintf("slave state not found: %s", slaveID), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_ = json.NewEncoder(w).Encode(state)
}

func (s *masterServer) subscribeStateUpdates(ctx context.Context) {
	pubsub := s.redisClient.SubscribeStates(ctx)
	defer func() {
		if err := pubsub.Close(); err != nil {
			log.Printf("close redis pubsub: %v", err)
		}
	}()

	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}

			state, err := redislayer.DecodeSlaveState(msg.Payload)
			if err != nil {
				log.Printf("decode slave state: %v", err)
				continue
			}
			if currentSessionID := s.currentSessionID(); currentSessionID == "" || state.SessionID != currentSessionID {
				continue
			}

			log.Printf("received slave state update: slave_id=%s pod=%s status=%s remaining_turns=%d", state.SlaveID, state.K8sPodName, state.Status, state.RemainingTurns)
			s.hub.broadcast(state)
		}
	}
}
