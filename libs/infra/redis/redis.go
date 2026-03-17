package redis

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	goredis "github.com/redis/go-redis/v9"

	"github.com/kurazuuuuuu/hackz-megalo/libs/domain"
	slavev1 "github.com/kurazuuuuuu/hackz-megalo/libs/transport/grpc/gen/slavev1"
)

type Client struct {
	raw           *goredis.Client
	eventsChannel string
	statesChannel string
}

const activeSessionKey = "session:active"

func New(addr, eventsChannel, statesChannel string) *Client {
	return &Client{
		raw: goredis.NewClient(&goredis.Options{
			Addr: addr,
		}),
		eventsChannel: eventsChannel,
		statesChannel: statesChannel,
	}
}

func (c *Client) Ping(ctx context.Context) error {
	return c.raw.Ping(ctx).Err()
}

func (c *Client) Close() error {
	return c.raw.Close()
}

func (c *Client) PublishEvent(ctx context.Context, event domain.Event) error {
	if strings.TrimSpace(event.SessionID) == "" {
		return fmt.Errorf("session_id is required")
	}

	payload, err := marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}

	key := fmt.Sprintf("session:%s:event:%d", event.SessionID, event.CreatedAt.UnixNano())
	if err := c.raw.Set(ctx, key, payload, 10*time.Minute).Err(); err != nil {
		return fmt.Errorf("set event: %w", err)
	}
	if err := c.raw.Publish(ctx, c.eventsChannel, payload).Err(); err != nil {
		return fmt.Errorf("publish event: %w", err)
	}
	return nil
}

func (c *Client) CreateSession(ctx context.Context, meta domain.SessionMeta) error {
	if strings.TrimSpace(meta.SessionID) == "" {
		return fmt.Errorf("session_id is required")
	}

	if meta.StartedAt.IsZero() {
		meta.StartedAt = time.Now().UTC()
	}

	metrics := domain.SessionMetrics{
		SessionID:  meta.SessionID,
		LiveSlaves: 0,
		GoneSlaves: 0,
		UpdatedAt:  meta.StartedAt,
	}

	metaPayload, err := marshal(meta)
	if err != nil {
		return fmt.Errorf("marshal session meta: %w", err)
	}
	metricsPayload, err := marshal(metrics)
	if err != nil {
		return fmt.Errorf("marshal session metrics: %w", err)
	}

	pipe := c.raw.TxPipeline()
	pipe.Set(ctx, sessionMetaKey(meta.SessionID), metaPayload, 0)
	pipe.Set(ctx, sessionMetricsKey(meta.SessionID), metricsPayload, 0)
	pipe.Set(ctx, activeSessionKey, meta.SessionID, 0)
	if _, err := pipe.Exec(ctx); err != nil {
		return fmt.Errorf("create session: %w", err)
	}
	return nil
}

func (c *Client) GetActiveSessionID(ctx context.Context) (string, error) {
	sessionID, err := c.raw.Get(ctx, activeSessionKey).Result()
	if err != nil {
		if err == goredis.Nil {
			return "", fmt.Errorf("active session not found")
		}
		return "", fmt.Errorf("get active session: %w", err)
	}
	return sessionID, nil
}

func (c *Client) GetSessionMeta(ctx context.Context, sessionID string) (domain.SessionMeta, error) {
	payload, err := c.raw.Get(ctx, sessionMetaKey(sessionID)).Result()
	if err != nil {
		if err == goredis.Nil {
			return domain.SessionMeta{}, fmt.Errorf("session meta not found: %s", sessionID)
		}
		return domain.SessionMeta{}, fmt.Errorf("get session meta: %w", err)
	}
	return DecodeSessionMeta(payload)
}

func (c *Client) GetSessionMetrics(ctx context.Context, sessionID string) (domain.SessionMetrics, error) {
	payload, err := c.raw.Get(ctx, sessionMetricsKey(sessionID)).Result()
	if err != nil {
		if err == goredis.Nil {
			return domain.SessionMetrics{}, fmt.Errorf("session metrics not found: %s", sessionID)
		}
		return domain.SessionMetrics{}, fmt.Errorf("get session metrics: %w", err)
	}
	return DecodeSessionMetrics(payload)
}

func (c *Client) DeleteSession(ctx context.Context, sessionID string) error {
	keys, err := c.raw.Keys(ctx, sessionSlavePattern(sessionID)).Result()
	if err != nil {
		return fmt.Errorf("list session slave keys: %w", err)
	}

	activeSessionID, err := c.raw.Get(ctx, activeSessionKey).Result()
	if err != nil && err != goredis.Nil {
		return fmt.Errorf("get active session before delete: %w", err)
	}

	pipe := c.raw.TxPipeline()
	if activeSessionID == sessionID {
		pipe.Del(ctx, activeSessionKey)
	}
	pipe.Del(ctx, sessionMetaKey(sessionID), sessionMetricsKey(sessionID))
	if len(keys) > 0 {
		pipe.Del(ctx, keys...)
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

func (c *Client) PublishSlaveState(ctx context.Context, state domain.SlaveState) error {
	if strings.TrimSpace(state.SessionID) == "" {
		return fmt.Errorf("session_id is required")
	}

	payload, err := marshal(state)
	if err != nil {
		return fmt.Errorf("marshal slave state: %w", err)
	}

	key := sessionSlaveKey(state.SessionID, state.SlaveID)
	if err := c.raw.Set(ctx, key, payload, 0).Err(); err != nil {
		return fmt.Errorf("set slave state: %w", err)
	}
	if err := c.raw.Publish(ctx, c.statesChannel, payload).Err(); err != nil {
		return fmt.Errorf("publish slave state: %w", err)
	}
	return nil
}

func (c *Client) SubscribeEvents(ctx context.Context) *goredis.PubSub {
	return c.raw.Subscribe(ctx, c.eventsChannel)
}

func (c *Client) SubscribeStates(ctx context.Context) *goredis.PubSub {
	return c.raw.Subscribe(ctx, c.statesChannel)
}

func (c *Client) GetSlaveState(ctx context.Context, sessionID, slaveID string) (domain.SlaveState, error) {
	key := sessionSlaveKey(sessionID, slaveID)
	payload, err := c.raw.Get(ctx, key).Result()
	if err != nil {
		if err == goredis.Nil {
			return domain.SlaveState{}, fmt.Errorf("slave state not found: %s", slaveID)
		}
		return domain.SlaveState{}, fmt.Errorf("get slave state: %w", err)
	}
	return DecodeSlaveState(payload)
}

func (c *Client) ListSlaveStates(ctx context.Context, sessionID string) ([]domain.SlaveState, error) {
	keys, err := c.raw.Keys(ctx, sessionSlavePattern(sessionID)).Result()
	if err != nil {
		return nil, fmt.Errorf("list slave state keys: %w", err)
	}
	sort.Strings(keys)

	states := make([]domain.SlaveState, 0, len(keys))
	for _, key := range keys {
		payload, err := c.raw.Get(ctx, key).Result()
		if err != nil {
			return nil, fmt.Errorf("get slave state from %s: %w", key, err)
		}
		state, err := DecodeSlaveState(payload)
		if err != nil {
			return nil, err
		}
		states = append(states, state)
	}
	return states, nil
}

func (c *Client) UpdateSessionMetrics(ctx context.Context, sessionID string, fn func(domain.SessionMetrics) domain.SessionMetrics) (domain.SessionMetrics, error) {
	const maxRetries = 8
	key := sessionMetricsKey(sessionID)

	for attempt := 0; attempt < maxRetries; attempt++ {
		var updated domain.SessionMetrics
		err := c.raw.Watch(ctx, func(tx *goredis.Tx) error {
			payload, err := tx.Get(ctx, key).Result()
			if err != nil {
				if err == goredis.Nil {
					return fmt.Errorf("session metrics not found: %s", sessionID)
				}
				return fmt.Errorf("get session metrics: %w", err)
			}

			metrics, err := DecodeSessionMetrics(payload)
			if err != nil {
				return err
			}
			metrics = fn(metrics)
			if metrics.SessionID == "" {
				metrics.SessionID = sessionID
			}
			metrics.UpdatedAt = time.Now().UTC()

			updatedPayload, err := marshal(metrics)
			if err != nil {
				return fmt.Errorf("marshal session metrics: %w", err)
			}

			if _, err := tx.TxPipelined(ctx, func(pipe goredis.Pipeliner) error {
				pipe.Set(ctx, key, updatedPayload, 0)
				return nil
			}); err != nil {
				return fmt.Errorf("set session metrics: %w", err)
			}

			updated = metrics
			return nil
		}, key)
		if err == nil {
			return updated, nil
		}
		if errors.Is(err, goredis.TxFailedErr) {
			continue
		}
		return domain.SessionMetrics{}, err
	}

	return domain.SessionMetrics{}, fmt.Errorf("update session metrics: retry limit exceeded for session %s", sessionID)
}

func DecodeEvent(payload string) (domain.Event, error) {
	var event domain.Event
	if err := json.Unmarshal([]byte(payload), &event); err != nil {
		return domain.Event{}, fmt.Errorf("decode event: %w", err)
	}
	return event, nil
}

func DecodeSlaveState(payload string) (domain.SlaveState, error) {
	var state domain.SlaveState
	if err := json.Unmarshal([]byte(payload), &state); err != nil {
		return domain.SlaveState{}, fmt.Errorf("decode slave state: %w", err)
	}
	return state, nil
}

func DecodeSessionMeta(payload string) (domain.SessionMeta, error) {
	var meta domain.SessionMeta
	if err := json.Unmarshal([]byte(payload), &meta); err != nil {
		return domain.SessionMeta{}, fmt.Errorf("decode session meta: %w", err)
	}
	return meta, nil
}

func DecodeSessionMetrics(payload string) (domain.SessionMetrics, error) {
	var metrics domain.SessionMetrics
	if err := json.Unmarshal([]byte(payload), &metrics); err != nil {
		return domain.SessionMetrics{}, fmt.Errorf("decode session metrics: %w", err)
	}
	return metrics, nil
}

func marshal(v any) (string, error) {
	payload, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(payload), nil
}

func ToProtoSlaveState(state domain.SlaveState) *slavev1.SlaveState {
	return &slavev1.SlaveState{
		SessionId:      state.SessionID,
		SlaveId:        state.SlaveID,
		K8SPodName:     state.K8sPodName,
		K8SPodUid:      state.K8sPodUID,
		PodIp:          state.PodIP,
		Status:         toProtoStatus(state.Status),
		DeathReason:    toProtoDeathReason(state.DeathReason),
		TurnsLived:     state.TurnsLived,
		RemainingTurns: state.RemainingTurns,
		ObservedAt:     state.ObservedAt.Format(time.RFC3339),
		Stress:         state.Stress,
		Fear:           state.Fear,
		Infected:       state.Infected,
		Firewall:       state.Firewall,
	}
}

func FromProtoSlaveState(state *slavev1.SlaveState, source string) domain.SlaveState {
	if state == nil {
		return domain.SlaveState{Source: source}
	}

	observedAt := time.Now().UTC()
	if raw := state.GetObservedAt(); raw != "" {
		if parsed, err := time.Parse(time.RFC3339, raw); err == nil {
			observedAt = parsed
		}
	}

	return domain.SlaveState{
		SessionID:      state.GetSessionId(),
		SlaveID:        state.GetSlaveId(),
		K8sPodName:     state.GetK8SPodName(),
		K8sPodUID:      state.GetK8SPodUid(),
		PodIP:          state.GetPodIp(),
		Status:         fromProtoStatus(state.GetStatus()),
		DeathReason:    fromProtoDeathReason(state.GetDeathReason()),
		TurnsLived:     state.GetTurnsLived(),
		RemainingTurns: state.GetRemainingTurns(),
		Stress:         state.GetStress(),
		Fear:           state.GetFear(),
		Infected:       state.GetInfected(),
		Firewall:       state.GetFirewall(),
		ObservedAt:     observedAt,
		Source:         source,
	}
}

func sessionMetaKey(sessionID string) string {
	return fmt.Sprintf("session:%s:meta", sessionID)
}

func sessionMetricsKey(sessionID string) string {
	return fmt.Sprintf("session:%s:metrics", sessionID)
}

func sessionSlaveKey(sessionID, slaveID string) string {
	return fmt.Sprintf("session:%s:slave:%s", sessionID, slaveID)
}

func sessionSlavePattern(sessionID string) string {
	return fmt.Sprintf("session:%s:slave:*", sessionID)
}

func toProtoStatus(status domain.SlaveStatus) slavev1.SlaveStatus {
	switch status {
	case domain.SlaveStatusLive:
		return slavev1.SlaveStatus_SLAVE_STATUS_LIVE
	case domain.SlaveStatusTerminating:
		return slavev1.SlaveStatus_SLAVE_STATUS_TERMINATING
	case domain.SlaveStatusGone:
		return slavev1.SlaveStatus_SLAVE_STATUS_GONE
	default:
		return slavev1.SlaveStatus_SLAVE_STATUS_UNSPECIFIED
	}
}

func toProtoDeathReason(reason domain.DeathReason) slavev1.DeathReason {
	switch reason {
	case domain.DeathReasonLifespan:
		return slavev1.DeathReason_DEATH_REASON_LIFESPAN
	case domain.DeathReasonDisease:
		return slavev1.DeathReason_DEATH_REASON_DISEASE
	case domain.DeathReasonProcessDown:
		return slavev1.DeathReason_DEATH_REASON_PROCESS_DOWN
	case domain.DeathReasonPodDown:
		return slavev1.DeathReason_DEATH_REASON_POD_DOWN
	case domain.DeathReasonUserAction:
		return slavev1.DeathReason_DEATH_REASON_USER_ACTION
	default:
		return slavev1.DeathReason_DEATH_REASON_UNSPECIFIED
	}
}

func fromProtoStatus(status slavev1.SlaveStatus) domain.SlaveStatus {
	switch status {
	case slavev1.SlaveStatus_SLAVE_STATUS_LIVE:
		return domain.SlaveStatusLive
	case slavev1.SlaveStatus_SLAVE_STATUS_TERMINATING:
		return domain.SlaveStatusTerminating
	case slavev1.SlaveStatus_SLAVE_STATUS_GONE:
		return domain.SlaveStatusGone
	default:
		return domain.SlaveStatusUnspecified
	}
}

func fromProtoDeathReason(reason slavev1.DeathReason) domain.DeathReason {
	switch reason {
	case slavev1.DeathReason_DEATH_REASON_LIFESPAN:
		return domain.DeathReasonLifespan
	case slavev1.DeathReason_DEATH_REASON_DISEASE:
		return domain.DeathReasonDisease
	case slavev1.DeathReason_DEATH_REASON_PROCESS_DOWN:
		return domain.DeathReasonProcessDown
	case slavev1.DeathReason_DEATH_REASON_POD_DOWN:
		return domain.DeathReasonPodDown
	case slavev1.DeathReason_DEATH_REASON_USER_ACTION:
		return domain.DeathReasonUserAction
	default:
		return domain.DeathReasonUnspecified
	}
}
