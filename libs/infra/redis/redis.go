package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	goredis "github.com/redis/go-redis/v9"

	"github.com/kurazuuuuuu/hackz-megalo/libs/domain"
)

type Client struct {
	raw           *goredis.Client
	eventsChannel string
	statesChannel string
}

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
	payload, err := marshal(event)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}

	key := fmt.Sprintf("game:event:%d", event.CreatedAt.UnixNano())
	if err := c.raw.Set(ctx, key, payload, 10*time.Minute).Err(); err != nil {
		return fmt.Errorf("set event: %w", err)
	}
	if err := c.raw.Publish(ctx, c.eventsChannel, payload).Err(); err != nil {
		return fmt.Errorf("publish event: %w", err)
	}
	return nil
}

func (c *Client) PublishSlaveState(ctx context.Context, state domain.SlaveState) error {
	payload, err := marshal(state)
	if err != nil {
		return fmt.Errorf("marshal slave state: %w", err)
	}

	key := fmt.Sprintf("slave:state:%s", state.PodID)
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

func marshal(v any) (string, error) {
	payload, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(payload), nil
}
