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

const (
	websocketWriteWait              = 5 * time.Second
	websocketPongWait               = 30 * time.Second
	websocketPingPeriod             = 10 * time.Second
	websocketExplicitDisconnectCode = 4000
)

type websocketClient struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (c *websocketClient) writeJSON(v any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.conn.SetWriteDeadline(time.Now().Add(websocketWriteWait)); err != nil {
		return err
	}
	return c.conn.WriteJSON(v)
}

func (c *websocketClient) writeControl(messageType int, data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn.WriteControl(messageType, data, time.Now().Add(websocketWriteWait))
}

type websocketHub struct {
	mu    sync.Mutex
	conns map[*websocket.Conn]*websocketClient
}

func newWebsocketHub() *websocketHub {
	return &websocketHub{
		conns: make(map[*websocket.Conn]*websocketClient),
	}
}

func (h *websocketHub) add(conn *websocket.Conn) *websocketClient {
	h.mu.Lock()
	defer h.mu.Unlock()
	client := &websocketClient{conn: conn}
	h.conns[conn] = client
	return client
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
	for conn, client := range h.conns {
		if err := client.writeJSON(v); err != nil {
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

type websocketClientMessage struct {
	Type        string             `json:"type"`
	SessionID   string             `json:"session_id"`
	SlaveID     string             `json:"slave_id"`
	Status      domain.SlaveStatus `json:"status"`
	DeathReason domain.DeathReason `json:"death_reason"`
}

type masterServer struct {
	redisClient                  *redislayer.Client
	hub                          *websocketHub
	mu                           sync.Mutex
	sessionID                    string
	sessionMeta                  domain.SessionMeta
	clientConnected              bool
	sessionClosing               bool
	sessionEndTimer              *time.Timer
	sessionDisconnectGracePeriod time.Duration
}

func (s *masterServer) tryBeginSessionConnection() (domain.SessionMeta, bool, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.sessionID == "pending" || s.clientConnected || s.sessionClosing {
		log.Printf(
			"reject websocket session connection current_session=%s client_connected=%t session_closing=%t",
			s.sessionID,
			s.clientConnected,
			s.sessionClosing,
		)
		return domain.SessionMeta{}, false, false
	}
	if s.sessionEndTimer != nil {
		s.sessionEndTimer.Stop()
		s.sessionEndTimer = nil
	}
	if s.sessionID != "" {
		s.clientConnected = true
		log.Printf("resume websocket session connection session_id=%s", s.sessionMeta.SessionID)
		return s.sessionMeta, true, true
	}
	s.sessionID = "pending"
	s.clientConnected = true
	log.Printf("reserve new websocket session slot")
	return domain.SessionMeta{}, false, true
}

func (s *masterServer) startSession(ctx context.Context) (domain.SessionMeta, error) {
	meta := domain.SessionMeta{
		SessionID: uuid.NewString(),
		StartedAt: time.Now().UTC(),
	}
	if err := s.redisClient.CreateSession(ctx, meta); err != nil {
		return domain.SessionMeta{}, fmt.Errorf("create session: %w", err)
	}
	log.Printf("created websocket session session_id=%s started_at=%s", meta.SessionID, meta.StartedAt.Format(time.RFC3339Nano))
	return meta, nil
}

func (s *masterServer) endSession(ctx context.Context, sessionID string) error {
	if strings.TrimSpace(sessionID) == "" {
		return nil
	}

	log.Printf("end session requested session_id=%s", sessionID)
	if err := s.markAllSlavesGone(ctx, sessionID); err != nil {
		return err
	}
	if err := s.redisClient.DeleteSession(ctx, sessionID); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	log.Printf("end session completed session_id=%s", sessionID)
	return nil
}

func (s *masterServer) markAllSlavesGone(ctx context.Context, sessionID string) error {
	states, err := s.redisClient.ListSlaveStates(ctx, sessionID)
	if err != nil {
		return fmt.Errorf("list slave states before session end: %w", err)
	}
	log.Printf("mark all slaves gone session_id=%s count=%d", sessionID, len(states))

	now := time.Now().UTC()
	for _, state := range states {
		state.Status = domain.SlaveStatusGone
		state.DeathReason = domain.DeathReasonProcessDown
		state.ObservedAt = now
		state.Source = "master-service"
		if err := s.redisClient.PublishSlaveState(ctx, state); err != nil {
			return fmt.Errorf("publish gone slave state %s: %w", state.SlaveID, err)
		}
	}

	_, err = s.redisClient.UpdateSessionMetrics(ctx, sessionID, func(metrics domain.SessionMetrics) domain.SessionMetrics {
		metrics.LiveSlaves = 0
		metrics.GoneSlaves = int32(len(states))
		return metrics
	})
	if err != nil {
		return fmt.Errorf("update final session metrics: %w", err)
	}

	return nil
}

func (s *masterServer) commitSession(meta domain.SessionMeta) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessionID = meta.SessionID
	s.sessionMeta = meta
	s.clientConnected = true
	s.sessionClosing = false
	log.Printf("commit websocket session session_id=%s", meta.SessionID)
}

func (s *masterServer) abortPendingSession() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.sessionID == "pending" {
		log.Printf("abort pending websocket session slot")
		s.sessionID = ""
		s.sessionMeta = domain.SessionMeta{}
		s.clientConnected = false
	}
}

func (s *masterServer) handleConnectionClosed(sessionID string, explicit bool) {
	if strings.TrimSpace(sessionID) == "" {
		s.abortPendingSession()
		return
	}

	s.mu.Lock()
	if s.sessionID != sessionID || s.sessionClosing {
		s.mu.Unlock()
		log.Printf(
			"ignore websocket close session_id=%s current_session=%s session_closing=%t",
			sessionID,
			s.sessionID,
			s.sessionClosing,
		)
		return
	}
	s.clientConnected = false
	if s.sessionEndTimer != nil {
		s.sessionEndTimer.Stop()
		s.sessionEndTimer = nil
	}
	if explicit || s.sessionDisconnectGracePeriod == 0 {
		s.sessionClosing = true
		s.mu.Unlock()
		log.Printf("close websocket session immediately session_id=%s explicit=%t", sessionID, explicit)
		s.finalizeSession(sessionID)
		return
	}
	s.mu.Unlock()

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.sessionID != sessionID || s.sessionClosing || s.clientConnected {
		return
	}
	log.Printf(
		"schedule session end after grace session_id=%s grace=%s",
		sessionID,
		s.sessionDisconnectGracePeriod,
	)
	s.sessionEndTimer = time.AfterFunc(s.sessionDisconnectGracePeriod, func() {
		s.finishSession(sessionID)
	})
}

func (s *masterServer) finishSession(sessionID string) {
	s.mu.Lock()
	if strings.TrimSpace(sessionID) == "" || s.sessionID != sessionID || s.clientConnected || s.sessionClosing {
		s.mu.Unlock()
		return
	}
	s.sessionClosing = true
	if s.sessionEndTimer != nil {
		s.sessionEndTimer.Stop()
		s.sessionEndTimer = nil
	}
	s.mu.Unlock()

	log.Printf("grace expired, finalizing session session_id=%s", sessionID)
	s.finalizeSession(sessionID)
}

func (s *masterServer) finalizeSession(sessionID string) {
	log.Printf("finalize session begin session_id=%s", sessionID)
	if err := s.endSession(context.Background(), sessionID); err != nil {
		log.Printf("end session %s: %v", sessionID, err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.sessionEndTimer != nil {
		s.sessionEndTimer.Stop()
		s.sessionEndTimer = nil
	}
	if s.sessionID == sessionID {
		s.sessionID = ""
		s.sessionMeta = domain.SessionMeta{}
	}
	s.clientConnected = false
	s.sessionClosing = false
	log.Printf("finalize session complete session_id=%s", sessionID)
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
		redisClient:                  redisClient,
		hub:                          newWebsocketHub(),
		sessionDisconnectGracePeriod: cfg.SessionDisconnectGracePeriod,
	}
	go serverState.subscribeStateUpdates(ctx)

	accessVerifier, err := newCloudflareAccessVerifier(cfg.CloudflareAccess)
	if err != nil {
		log.Fatalf("initialize cloudflare access auth: %v", err)
	}

	withAuth := func(handler http.Handler) http.Handler {
		return withCloudflareAccessAuth(accessVerifier, handler)
	}

	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.Handle("/events", withAuth(http.HandlerFunc(serverState.handlePublishEvent)))
	mux.Handle("/internal/events", withAuth(http.HandlerFunc(serverState.handlePublishEvent)))
	mux.Handle("/internal/session", withAuth(http.HandlerFunc(serverState.handleGetActiveSession)))
	mux.Handle("/internal/session/metrics", withAuth(http.HandlerFunc(serverState.handleGetActiveSessionMetrics)))
	mux.Handle("/internal/slaves", withAuth(http.HandlerFunc(serverState.handleListSlaveStates)))
	mux.Handle("/internal/slaves/", withAuth(http.HandlerFunc(serverState.handleGetSlaveState)))
	mux.Handle("/ws", withAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sessionMeta, resumed, ok := serverState.tryBeginSessionConnection()
		if !ok {
			log.Printf("reject websocket upgrade remote=%s reason=active session already exists", r.RemoteAddr)
			http.Error(w, "active session already exists", http.StatusConflict)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("websocket upgrade failed remote=%s resumed=%t err=%v", r.RemoteAddr, resumed, err)
			if resumed {
				serverState.handleConnectionClosed(sessionMeta.SessionID, false)
			} else {
				serverState.abortPendingSession()
			}
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if !resumed {
			sessionMeta, err = serverState.startSession(r.Context())
			if err != nil {
				serverState.abortPendingSession()
				_ = conn.Close()
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			serverState.commitSession(sessionMeta)
		}
		log.Printf("websocket connected remote=%s session_id=%s resumed=%t", r.RemoteAddr, sessionMeta.SessionID, resumed)

		client := serverState.hub.add(conn)
		explicitDisconnect := false
		defer func() {
			serverState.hub.remove(conn)
			log.Printf("websocket disconnected remote=%s session_id=%s explicit=%t", r.RemoteAddr, sessionMeta.SessionID, explicitDisconnect)
			serverState.handleConnectionClosed(sessionMeta.SessionID, explicitDisconnect)
		}()

		if err := conn.SetReadDeadline(time.Now().Add(websocketPongWait)); err != nil {
			return
		}
		conn.SetPongHandler(func(string) error {
			return conn.SetReadDeadline(time.Now().Add(websocketPongWait))
		})

		pingDone := make(chan struct{})
		go func() {
			ticker := time.NewTicker(websocketPingPeriod)
			defer ticker.Stop()
			for {
				select {
				case <-pingDone:
					return
				case <-ticker.C:
					if err := client.writeControl(websocket.PingMessage, nil); err != nil {
						_ = conn.Close()
						return
					}
				}
			}
		}()
		defer close(pingDone)

		for {
			_, payload, err := conn.ReadMessage()
			if err != nil {
				explicitDisconnect = websocket.IsCloseError(err, websocketExplicitDisconnectCode)
				if closeErr, ok := err.(*websocket.CloseError); ok {
					log.Printf(
						"websocket read closed remote=%s session_id=%s code=%d text=%s explicit=%t",
						r.RemoteAddr,
						sessionMeta.SessionID,
						closeErr.Code,
						closeErr.Text,
						explicitDisconnect,
					)
				} else {
					log.Printf(
						"websocket read failed remote=%s session_id=%s explicit=%t err=%v",
						r.RemoteAddr,
						sessionMeta.SessionID,
						explicitDisconnect,
						err,
					)
				}
				return
			}
			if err := serverState.handleClientMessage(r.Context(), sessionMeta.SessionID, payload); err != nil {
				log.Printf("handle websocket client message: %v", err)
			}
		}
	})))

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           withCORS(mux),
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

func (s *masterServer) handleClientMessage(ctx context.Context, sessionID string, payload []byte) error {
	var message websocketClientMessage
	if err := json.Unmarshal(payload, &message); err != nil {
		return fmt.Errorf("decode websocket client message: %w", err)
	}

	switch message.Type {
	case "pod_state_update":
		return s.handlePodStateUpdate(ctx, sessionID, message)
	default:
		return fmt.Errorf("unsupported websocket message type: %s", message.Type)
	}
}

func (s *masterServer) handlePodStateUpdate(ctx context.Context, sessionID string, message websocketClientMessage) error {
	if message.SessionID != "" && message.SessionID != sessionID {
		return fmt.Errorf("session mismatch")
	}
	if message.SlaveID == "" {
		return fmt.Errorf("slave_id is required")
	}
	if message.Status != domain.SlaveStatusGone {
		return fmt.Errorf("unsupported status: %s", message.Status)
	}
	if message.DeathReason != domain.DeathReasonPodDown && message.DeathReason != domain.DeathReasonUserAction {
		return fmt.Errorf("unsupported death_reason: %s", message.DeathReason)
	}

	previousState, err := s.redisClient.GetSlaveState(ctx, sessionID, message.SlaveID)
	if err != nil {
		return err
	}
	log.Printf(
		"frontend pod state update session_id=%s slave_id=%s previous_status=%s next_status=%s death_reason=%s",
		sessionID,
		message.SlaveID,
		previousState.Status,
		message.Status,
		message.DeathReason,
	)

	nextState := previousState
	nextState.Status = domain.SlaveStatusGone
	nextState.DeathReason = message.DeathReason
	nextState.ObservedAt = time.Now().UTC()
	nextState.Source = "frontend-webxr"

	if err := s.redisClient.PublishSlaveState(ctx, nextState); err != nil {
		return fmt.Errorf("publish slave state: %w", err)
	}
	if err := applySessionMetricsForStateChange(ctx, s.redisClient, sessionID, previousState, nextState); err != nil {
		return fmt.Errorf("update session metrics: %w", err)
	}
	return nil
}

func isTerminalState(status domain.SlaveStatus) bool {
	return status == domain.SlaveStatusTerminating || status == domain.SlaveStatusGone
}

func applySessionMetricsForStateChange(ctx context.Context, redisClient *redislayer.Client, sessionID string, previousState, currentState domain.SlaveState) error {
	if isTerminalState(previousState.Status) || !isTerminalState(currentState.Status) {
		return nil
	}

	_, err := redisClient.UpdateSessionMetrics(ctx, sessionID, func(metrics domain.SessionMetrics) domain.SessionMetrics {
		if metrics.LiveSlaves > 0 {
			metrics.LiveSlaves--
		}
		metrics.GoneSlaves++
		return metrics
	})
	return err
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
		log.Printf("publish event rejected active session lookup failed err=%v", err)
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
	log.Printf("published event session_id=%s event_id=%d target_pod=%s", sessionID, event.EventID, event.TargetPod)

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
		log.Printf("get active session handler miss err=%v", err)
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
		log.Printf("get active session metrics handler miss err=%v", err)
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
		log.Printf("list slave states with no active session err=%v", err)
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
		log.Printf("get slave state handler miss active session slave_id=%s err=%v", slaveID, err)
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

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
