package slaveapp

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"sort"
	"sync"
	"time"

	"github.com/kurazuuuuuu/hackz-megalo/libs/domain"
	slavev1 "github.com/kurazuuuuuu/hackz-megalo/libs/transport/grpc/gen/slavev1"
)

type Service struct {
	slavev1.UnimplementedSlaveServiceServer
	mu                   sync.RWMutex
	InitialRemainingTurns int32
	pods                 map[string]*podState
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

func (s *Service) SetupPopulation(basePodID, basePodName, basePodUID, podIP string, podCount int32) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.pods == nil {
		s.pods = make(map[string]*podState)
	}
	count := int(podCount)
	if count <= 0 {
		count = 1
	}

	for i := 0; i < count; i++ {
		suffix := ""
		if count > 1 {
			suffix = fmt.Sprintf("-%02d", i+1)
		}
		podID := fmt.Sprintf("%s%s", basePodID, suffix)
		s.pods[podID] = &podState{
			PodID:       podID,
			K8sPodName:  fmt.Sprintf("%s%s", basePodName, suffix),
			K8sPodUID:   fmt.Sprintf("%s%s", basePodUID, suffix),
			PodIP:       podIP,
			Remaining:   s.InitialRemainingTurns,
			Status:      domain.SlaveStatusLive,
			DeathReason: domain.DeathReasonUnspecified,
			ObservedAt:  time.Now().UTC(),
		}
	}
}

func (s *Service) UnregisteredPods() []PodRegistration {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var out []PodRegistration
	keys := make([]string, 0, len(s.pods))
	for podID := range s.pods {
		keys = append(keys, podID)
	}
	sort.Strings(keys)
	for _, podID := range keys {
		pod := s.pods[podID]
		if pod.SlaveID != "" {
			continue
		}
		out = append(out, PodRegistration{
			PodID:       pod.PodID,
			InitialTurn: s.InitialRemainingTurns,
			K8SPodName:  pod.K8sPodName,
			K8SPodUID:   pod.K8sPodUID,
			PodIP:       pod.PodIP,
		})
	}
	return out
}

func (s *Service) SetRegistration(podID, slaveID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if pod, ok := s.pods[podID]; ok {
		pod.SlaveID = slaveID
	}
}

func (s *Service) ExecuteEvent(_ context.Context, req *slavev1.ExecuteEventRequest) (*slavev1.ExecuteEventResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.pods) == 0 {
		return nil, fmt.Errorf("no pod states configured")
	}

	rng := rand.New(rand.NewSource(req.GetSeed()))
	target := s.findTargetPodLocked(req.GetTargetPod(), rng)
	if target == nil {
		return nil, fmt.Errorf("target pod not found")
	}
	if target.Status == domain.SlaveStatusGone {
		return &slavev1.ExecuteEventResponse{
			Accepted: false,
			Message:  "target pod already gone",
			SlaveState: &slavev1.SlaveState{
				SlaveId:        target.SlaveID,
				K8SPodName:     target.K8sPodName,
				K8SPodUid:      target.K8sPodUID,
				PodIp:          target.PodIP,
				Status:         toProtoStatus(target.Status),
				DeathReason:    toProtoDeathReason(target.DeathReason),
				TurnsLived:     target.TurnsLived,
				RemainingTurns: target.Remaining,
				ObservedAt:     time.Now().UTC().Format(time.RFC3339),
				Stress:         target.Stress,
				Fear:           target.Fear,
				Infected:       target.Infected,
				Firewall:       target.Firewall,
			},
		}, nil
	}

	target.tick()
	switch req.GetEventId() {
	case 1:
		target.applyHit(rng)
	case 2:
		target.applyScare(rng)
	case 3:
		target.applyInfection(rng)
	case 4:
		target.applyFirewall(rng)
	default:
		target.recover()
	}

	target.mutateLife(rng)
	target.ObservedAt = time.Now().UTC()

	return &slavev1.ExecuteEventResponse{
		Accepted:   target.Status == domain.SlaveStatusLive || target.Status == domain.SlaveStatusTerminating,
		Message:    describePodState(target),
		SlaveState: target.toProtoState(),
	}, nil
}

func (s *Service) findTargetPodLocked(target string, rng *rand.Rand) *podState {
	if target != "" {
		if pod, ok := s.pods[target]; ok {
			return pod
		}
	}
	keys := make([]string, 0, len(s.pods))
	for podID := range s.pods {
		keys = append(keys, podID)
	}
	sort.Strings(keys)
	return s.pods[keys[rng.Intn(len(keys))]]
}

func (s *Service) pickOtherPodLocked(exclude string, rng *rand.Rand) *podState {
	candidates := make([]*podState, 0, len(s.pods)-1)
	for _, pod := range s.pods {
		if pod.PodID == exclude || pod.Status == domain.SlaveStatusGone {
			continue
		}
		candidates = append(candidates, pod)
	}
	if len(candidates) == 0 {
		return nil
	}
	return candidates[rng.Intn(len(candidates))]
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

func (p *podState) spreadInfection(seed *rand.Rand, spreadTarget *podState) {
	if spreadTarget == nil {
		return
	}
	spreadTarget.Infected = true
	spreadTarget.Stress += int32(seed.Intn(6))
	spreadTarget.Fear += int32(4 + seed.Intn(7))
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
