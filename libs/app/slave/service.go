package slaveapp

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"sync"
	"time"

	"github.com/kurazuuuuuu/hackz-megalo/libs/domain"
	slavev1 "github.com/kurazuuuuuu/hackz-megalo/libs/transport/grpc/gen/slavev1"
)

type Service struct {
	slavev1.UnimplementedSlaveServiceServer
	mu                    sync.RWMutex
	shutdownOnce          sync.Once
	InitialRemainingTurns int32
	OnShutdown            func(string)
	pod                   podState
}

type PodRegistration struct {
	PodID       string
	InitialTurn int32
	K8SPodName  string
	K8SPodUID   string
	PodIP       string
}

type podState struct {
	PodID       string
	K8sPodName  string
	K8sPodUID   string
	PodIP       string
	SlaveID     string
	TurnsLived  int32
	Remaining   int32
	Status      domain.SlaveStatus
	DeathReason domain.DeathReason
	ObservedAt  time.Time
	Stress      int32
	Fear        int32
	Infected    bool
	Firewall    bool
}

func (s *Service) SetupPod(podID, podName, podUID, podIP string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.pod = podState{
		PodID:       podID,
		K8sPodName:  podName,
		K8sPodUID:   podUID,
		PodIP:       podIP,
		Remaining:   s.InitialRemainingTurns,
		Status:      domain.SlaveStatusLive,
		DeathReason: domain.DeathReasonUnspecified,
		ObservedAt:  time.Now().UTC(),
	}
}

func (s *Service) RegistrationInfo() (PodRegistration, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.pod.PodID == "" || s.pod.SlaveID != "" {
		return PodRegistration{}, false
	}

	return PodRegistration{
		PodID:       s.pod.PodID,
		InitialTurn: s.InitialRemainingTurns,
		K8SPodName:  s.pod.K8sPodName,
		K8SPodUID:   s.pod.K8sPodUID,
		PodIP:       s.pod.PodIP,
	}, true
}

func (s *Service) SetRegistration(slaveID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pod.SlaveID = slaveID
}

func (s *Service) CurrentState() domain.SlaveState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.pod.toDomainState()
}

func (s *Service) MatchesTarget(target string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.pod.matchesTarget(target)
}

func (s *Service) ExecuteEvent(_ context.Context, req *slavev1.ExecuteEventRequest) (*slavev1.ExecuteEventResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.pod.PodID == "" {
		return nil, fmt.Errorf("pod state not configured")
	}
	if req.GetTargetPod() != "" && !s.pod.matchesTarget(req.GetTargetPod()) {
		return nil, fmt.Errorf("target pod not found")
	}
	if s.pod.Status == domain.SlaveStatusGone {
		return &slavev1.ExecuteEventResponse{
			Accepted:   false,
			Message:    "target pod already gone",
			SlaveState: s.pod.toProtoState(),
		}, nil
	}

	rng := rand.New(rand.NewSource(req.GetSeed()))
	s.pod.tick()
	switch req.GetEventId() {
	case 1:
		s.pod.applyHit(rng)
	case 2:
		s.pod.applyScare(rng)
	case 3:
		s.pod.applyInfection(rng)
	case 4:
		s.pod.applyFirewall(rng)
	default:
		s.pod.recover()
	}

	s.pod.mutateLife(rng)
	s.pod.ObservedAt = time.Now().UTC()

	return &slavev1.ExecuteEventResponse{
		Accepted:   s.pod.Status == domain.SlaveStatusLive || s.pod.Status == domain.SlaveStatusTerminating,
		Message:    describePodState(&s.pod),
		SlaveState: s.pod.toProtoState(),
	}, nil
}

func (s *Service) Shutdown(_ context.Context, req *slavev1.ShutdownRequest) (*slavev1.ShutdownResponse, error) {
	if s.OnShutdown != nil {
		s.shutdownOnce.Do(func() {
			go s.OnShutdown(req.GetReason())
		})
	}

	return &slavev1.ShutdownResponse{Accepted: true}, nil
}

func (p *podState) matchesTarget(target string) bool {
	return target == p.PodID || target == p.SlaveID || target == p.K8sPodName || target == p.PodIP
}

func (p *podState) toDomainState() domain.SlaveState {
	return domain.SlaveState{
		SlaveID:        p.SlaveID,
		K8sPodName:     p.K8sPodName,
		K8sPodUID:      p.K8sPodUID,
		PodIP:          p.PodIP,
		Status:         p.Status,
		DeathReason:    p.DeathReason,
		TurnsLived:     p.TurnsLived,
		RemainingTurns: p.Remaining,
		Stress:         p.Stress,
		Fear:           p.Fear,
		Infected:       p.Infected,
		Firewall:       p.Firewall,
		ObservedAt:     p.ObservedAt,
		Source:         "slave-service",
	}
}

func (p *podState) toProtoState() *slavev1.SlaveState {
	return &slavev1.SlaveState{
		SlaveId:        p.SlaveID,
		K8SPodName:     p.K8sPodName,
		K8SPodUid:      p.K8sPodUID,
		PodIp:          p.PodIP,
		Status:         toProtoStatus(p.Status),
		DeathReason:    toProtoDeathReason(p.DeathReason),
		TurnsLived:     p.TurnsLived,
		RemainingTurns: p.Remaining,
		ObservedAt:     p.ObservedAt.Format(time.RFC3339),
		Stress:         p.Stress,
		Fear:           p.Fear,
		Infected:       p.Infected,
		Firewall:       p.Firewall,
	}
}

func (p *podState) tick() {
	p.TurnsLived++
	if p.Remaining > 0 {
		p.Remaining--
	}
	if p.Stress > 0 {
		p.Stress--
	}
	if p.Fear > 0 {
		p.Fear--
	}
}

func (p *podState) applyHit(rng *rand.Rand) {
	damage := int32(10 + rng.Intn(16))
	if p.Firewall {
		damage = int32(math.Round(float64(damage) * 0.5))
	}
	p.Stress += damage
	p.Fear += int32(8 + rng.Intn(10))
}

func (p *podState) applyScare(rng *rand.Rand) {
	shake := int32(14 + rng.Intn(12))
	if p.Firewall {
		shake = int32(math.Round(float64(shake) * 0.7))
	}
	p.Fear += shake
}

func (p *podState) applyInfection(rng *rand.Rand) {
	p.Infected = true
	p.Stress += int32(6 + rng.Intn(8))
	p.Fear += int32(5 + rng.Intn(4))
}

func (p *podState) applyFirewall(rng *rand.Rand) {
	p.Firewall = !p.Firewall
	if p.Firewall {
		p.Stress = maxInt32(p.Stress-4, 0)
		p.Fear = maxInt32(p.Fear-2, 0)
	} else {
		p.Stress += int32(rng.Intn(8))
	}
}

func (p *podState) recover() {
	p.Stress = maxInt32(p.Stress-1, 0)
	p.Fear = maxInt32(p.Fear-2, 0)
}

func (p *podState) mutateLife(seed *rand.Rand) {
	if p.Remaining <= 0 {
		p.Status = domain.SlaveStatusTerminating
		p.DeathReason = domain.DeathReasonLifespan
	}

	if p.Status == domain.SlaveStatusLive && p.Stress >= 85 {
		p.Status = domain.SlaveStatusTerminating
		p.DeathReason = domain.DeathReasonUserAction
	}

	if p.Status == domain.SlaveStatusLive && p.Infected && p.Fear > 70 {
		if seed.Float64() < 0.35 {
			p.Status = domain.SlaveStatusTerminating
			p.DeathReason = domain.DeathReasonDisease
		}
	}

	if p.Status == domain.SlaveStatusTerminating && seed.Float64() < 0.35 {
		p.Status = domain.SlaveStatusGone
	}
}

func describePodState(p *podState) string {
	switch p.Status {
	case domain.SlaveStatusGone:
		return "pod terminated"
	case domain.SlaveStatusTerminating:
		return "pod is terminating"
	default:
		state := "pod alive"
		if p.Infected {
			state += " (infected)"
		}
		if p.Firewall {
			state += " (firewall)"
		}
		return state
	}
}

func maxInt32(current, min int32) int32 {
	if current > min {
		return current
	}
	return min
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
