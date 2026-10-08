package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The curated IDs come from the same OSM snapshot and canonical room roster as
// the playable city. An activity is a player-organized virtual visit, not a
// reservation at the real business.
//
//go:embed activity_venues.json
var activityVenuesJSON []byte

type activityVenue struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Category  string  `json:"category"`
	Area      string  `json:"area"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

var activityVenues, activityVenueByID = loadActivityVenues(activityVenuesJSON)
var activityVenueCategories = map[string]string{
	"nightlife": "bar", "coffee": "cafe", "outdoors": "beach", "culture": "culture", "wellness": "gym",
}

func loadActivityVenues(data []byte) ([]activityVenue, map[string]activityVenue) {
	var venues []activityVenue
	if json.Unmarshal(data, &venues) != nil || len(venues) < 8 || len(venues) > 12 {
		panic("invalid bundled activity venues")
	}
	byID := make(map[string]activityVenue, len(venues))
	for _, venue := range venues {
		_, room := chatRooms["lisbon:hotspot:"+venue.ID]
		validCategory := venue.Category == "bar" || venue.Category == "cafe" || venue.Category == "beach" || venue.Category == "culture" || venue.Category == "gym"
		if !room || !validCategory || venue.Name == "" || venue.Area == "" ||
			venue.Latitude < minPresenceLatitude || venue.Latitude > maxPresenceLatitude ||
			venue.Longitude < minPresenceLongitude || venue.Longitude > maxPresenceLongitude {
			panic("invalid bundled activity venue")
		}
		if _, duplicate := byID[venue.ID]; duplicate {
			panic("duplicate bundled activity venue")
		}
		byID[venue.ID] = venue
	}
	return venues, byID
}

type activityWallet struct {
	Balance  int    `json:"balance"`
	Currency string `json:"currency"`
}
type activityPerson struct {
	ID     string `json:"id"`
	Handle string `json:"handle"`
}
type activitySummary struct {
	ID            string         `json:"id"`
	Title         string         `json:"title"`
	Category      string         `json:"category"`
	TravellerType string         `json:"travellerType"`
	VenueID       string         `json:"venueId"`
	StartsAt      string         `json:"startsAt"`
	Capacity      int            `json:"capacity"`
	MemberCount   int            `json:"memberCount"`
	Host          activityPerson `json:"host"`
	Joined        bool           `json:"joined"`
	CreatedAt     string         `json:"createdAt"`
}
type activityMember struct {
	activityPerson
	UserType    string `json:"userType"`
	JoinedAt    string `json:"joinedAt"`
	SocialOptIn bool   `json:"socialOptIn"`
}
type activityEvent struct {
	ID        string          `json:"id"`
	Kind      string          `json:"kind"`
	Actor     activityPerson  `json:"actor"`
	Target    *activityPerson `json:"target,omitempty"`
	Label     string          `json:"label"`
	CreatedAt string          `json:"createdAt"`
	InviteID  string          `json:"inviteId,omitempty"`
}
type activityRoom struct {
	activitySummary
	Members  []activityMember `json:"members"`
	Messages []chatMessage    `json:"messages"`
	Events   []activityEvent  `json:"events"`
}
type activityEnvelope struct {
	Activity activityRoom   `json:"activity"`
	Wallet   activityWallet `json:"wallet"`
}
type activityCreateInput struct {
	Title         string `json:"title"`
	Category      string `json:"category"`
	TravellerType string `json:"travellerType"`
	VenueID       string `json:"venueId"`
	StartsAt      string `json:"startsAt"`
	Capacity      int    `json:"capacity"`
	ClientID      string `json:"clientId"`
}
type activityActionInput struct {
	Kind     string `json:"kind"`
	Item     string `json:"item,omitempty"`
	TargetID string `json:"targetId,omitempty"`
	InviteID string `json:"inviteId,omitempty"`
	ClientID string `json:"clientId"`
}
type activityJoinInput struct {
	SocialOptIn bool `json:"socialOptIn"`
}
type activityMessageInput struct {
	Body     string `json:"body"`
	ClientID string `json:"clientId"`
}

func normalizeActivityUUID(value string) (string, error) {
	if !chatUUID.MatchString(value) || value == "00000000-0000-0000-0000-000000000000" {
		return "", apiError("invalid_client_id")
	}
	return strings.ToLower(value), nil
}

// Time-window validation happens after checking the creation nonce so a
// successful creation can still be retried when its start time has passed.
func normalizeActivityCreate(input activityCreateInput) (activityCreateInput, error) {
	input.Title = strings.TrimSpace(input.Title)
	if !utf8.ValidString(input.Title) || utf8.RuneCountInString(input.Title) < 3 || utf8.RuneCountInString(input.Title) > 80 || input.Capacity < 2 || input.Capacity > 12 {
		return input, apiError("invalid_activity")
	}
	for _, character := range input.Title {
		if unicode.IsControl(character) {
			return input, apiError("invalid_activity")
		}
	}
	venue, exists := activityVenueByID[input.VenueID]
	if !exists || activityVenueCategories[input.Category] != venue.Category {
		return input, apiError("invalid_activity")
	}
	switch input.TravellerType {
	case "everyone", "tourist", "nomad", "expat", "local":
	default:
		return input, apiError("invalid_activity")
	}
	start, err := time.Parse(time.RFC3339Nano, input.StartsAt)
	if err != nil {
		return input, apiError("invalid_activity")
	}
	_, offset := start.Zone()
	if offset != 0 {
		return input, apiError("invalid_activity")
	}
	input.StartsAt = start.UTC().Format(time.RFC3339Nano)
	input.ClientID, err = normalizeActivityUUID(input.ClientID)
	return input, err
}

func validActivityStart(input activityCreateInput, now time.Time) bool {
	start, err := time.Parse(time.RFC3339Nano, input.StartsAt)
	// A minute accommodates a user choosing "now" and normal request latency.
	return err == nil && !start.Before(now.Add(-time.Minute)) && !start.After(now.Add(30*24*time.Hour))
}

func normalizeActivityAction(input activityActionInput) (activityActionInput, error) {
	var err error
	input.ClientID, err = normalizeActivityUUID(input.ClientID)
	if err != nil {
		return input, err
	}
	if input.TargetID != "" {
		input.TargetID, err = normalizeActivityUUID(input.TargetID)
		if err != nil {
			return input, apiError("invalid_action")
		}
	}
	if input.InviteID != "" {
		input.InviteID, err = normalizeActivityUUID(input.InviteID)
		if err != nil {
			return input, apiError("invalid_action")
		}
	}
	switch input.Kind {
	case "drink":
		if input.TargetID != "" || input.InviteID != "" || (input.Item != "coffee" && input.Item != "mocktail" && input.Item != "beer") {
			return input, apiError("invalid_action")
		}
	case "flirt", "challenge":
		if input.TargetID == "" || input.InviteID != "" || input.Item != "" {
			return input, apiError("invalid_action")
		}
	case "accept-challenge", "decline-challenge":
		if input.InviteID == "" || input.TargetID != "" || input.Item != "" {
			return input, apiError("invalid_action")
		}
	case "dance", "wave", "compliment":
		if input.Item != "" || input.InviteID != "" {
			return input, apiError("invalid_action")
		}
	default:
		return input, apiError("invalid_action")
	}
	return input, nil
}

func activityPayload(value any) string { data, _ := json.Marshal(value); return string(data) }

type activityHandler struct {
	db                                           *pgxpool.Pool
	now                                          func() time.Time
	reads, creates, mutations, messages, actions chatLimiter
}

func (s *server) registerActivityRoutes(mux *http.ServeMux) {
	h := &activityHandler{db: s.db, now: s.now, reads: newChatLimiter(1024, 120), creates: newChatLimiter(1024, 6), mutations: newChatLimiter(1024, 60), messages: newChatLimiter(1024, 20), actions: newChatLimiter(1024, 60)}
	mux.Handle("GET /v1/wallet", s.requireSession(http.HandlerFunc(h.wallet)))
	mux.Handle("GET /v1/activities", s.requireSession(http.HandlerFunc(h.list)))
	mux.Handle("POST /v1/activities", s.requireSession(http.HandlerFunc(h.create)))
	mux.Handle("GET /v1/activities/{id}", s.requireSession(http.HandlerFunc(h.get)))
	mux.Handle("POST /v1/activities/{id}/join", s.requireSession(http.HandlerFunc(h.join)))
	mux.Handle("POST /v1/activities/{id}/leave", s.requireSession(http.HandlerFunc(h.leave)))
	mux.Handle("POST /v1/activities/{id}/messages", s.requireSession(http.HandlerFunc(h.message)))
	mux.Handle("POST /v1/activities/{id}/actions", s.requireSession(http.HandlerFunc(h.action)))
}

type activityOperation func(context.Context, pgx.Tx, authUser) (any, int, error)

// Every membership-sensitive operation keeps the activity row locked until
// commit. Leaving/closing cannot race a send, purchase, or capacity check.
func (h *activityHandler) transaction(w http.ResponseWriter, r *http.Request, limiter *chatLimiter, operation activityOperation) {
	if r.URL.RawQuery != "" {
		fail(w, apiError("invalid_query"))
		return
	}
	u := currentUser(r)
	if !limiter.allow(u.ID, h.now()) {
		w.Header().Set("Retry-After", "60")
		fail(w, apiError("rate_limited"))
		return
	}
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var active string
	err = tx.QueryRow(r.Context(), `SELECT id::text FROM users WHERE id=$1 AND account_status='active' AND deleted_at IS NULL FOR SHARE`, u.ID).Scan(&active)
	if errors.Is(err, pgx.ErrNoRows) {
		err = apiError("session_expired")
	}
	if err != nil {
		fail(w, err)
		return
	}
	body, status, err := operation(r.Context(), tx, u)
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		fail(w, err)
		return
	}
	respond(w, status, body)
}

func activityPathID(r *http.Request) (string, error) {
	id, err := normalizeActivityUUID(r.PathValue("id"))
	if err != nil {
		return "", apiError("invalid_activity_id")
	}
	return id, nil
}

func (h *activityHandler) wallet(w http.ResponseWriter, r *http.Request) {
	h.transaction(w, r, &h.reads, func(ctx context.Context, tx pgx.Tx, u authUser) (any, int, error) {
		wallet, err := loadActivityWallet(ctx, tx, u.ID, false)
		return struct {
			Wallet activityWallet `json:"wallet"`
		}{wallet}, http.StatusOK, err
	})
}
func (h *activityHandler) list(w http.ResponseWriter, r *http.Request) {
	h.transaction(w, r, &h.reads, func(ctx context.Context, tx pgx.Tx, u authUser) (any, int, error) {
		wallet, err := loadActivityWallet(ctx, tx, u.ID, false)
		if err != nil {
			return nil, 0, err
		}
		activities, err := listActivities(ctx, tx, u.ID, h.now())
		return struct {
			Activities []activitySummary `json:"activities"`
			Wallet     activityWallet    `json:"wallet"`
			Venues     []activityVenue   `json:"venues"`
		}{activities, wallet, activityVenues}, http.StatusOK, err
	})
}
func (h *activityHandler) create(w http.ResponseWriter, r *http.Request) {
	var input activityCreateInput
	if err := decodeJSON(r, &input); err != nil {
		fail(w, err)
		return
	}
	input, err := normalizeActivityCreate(input)
	if err != nil {
		fail(w, err)
		return
	}
	h.transaction(w, r, &h.creates, func(ctx context.Context, tx pgx.Tx, u authUser) (any, int, error) {
		id, created, err := createActivity(ctx, tx, u.ID, input, h.now())
		if err != nil {
			return nil, 0, err
		}
		room, err := loadActivityRoom(ctx, tx, u.ID, id)
		if err != nil {
			return nil, 0, err
		}
		wallet, err := loadActivityWallet(ctx, tx, u.ID, false)
		status := http.StatusOK
		if created {
			status = http.StatusCreated
		}
		return activityEnvelope{room, wallet}, status, err
	})
}
func (h *activityHandler) get(w http.ResponseWriter, r *http.Request) {
	id, err := activityPathID(r)
	if err != nil {
		fail(w, err)
		return
	}
	h.transaction(w, r, &h.reads, func(ctx context.Context, tx pgx.Tx, u authUser) (any, int, error) {
		room, err := loadActivityRoom(ctx, tx, u.ID, id)
		if err != nil {
			return nil, 0, err
		}
		wallet, err := loadActivityWallet(ctx, tx, u.ID, false)
		return activityEnvelope{room, wallet}, http.StatusOK, err
	})
}
func (h *activityHandler) join(w http.ResponseWriter, r *http.Request) {
	id, err := activityPathID(r)
	if err != nil {
		fail(w, err)
		return
	}
	var input *activityJoinInput
	if err = decodeJSON(r, &input); err != nil {
		fail(w, err)
		return
	}
	if input == nil {
		fail(w, apiError("invalid_activity"))
		return
	}
	h.transaction(w, r, &h.mutations, func(ctx context.Context, tx pgx.Tx, u authUser) (any, int, error) {
		if err := joinActivity(ctx, tx, u.ID, id, input.SocialOptIn); err != nil {
			return nil, 0, err
		}
		room, err := loadActivityRoom(ctx, tx, u.ID, id)
		if err != nil {
			return nil, 0, err
		}
		wallet, err := loadActivityWallet(ctx, tx, u.ID, false)
		return activityEnvelope{room, wallet}, http.StatusOK, err
	})
}
func (h *activityHandler) leave(w http.ResponseWriter, r *http.Request) {
	id, err := activityPathID(r)
	if err != nil {
		fail(w, err)
		return
	}
	var input *struct{}
	if err = decodeJSON(r, &input); err != nil {
		fail(w, err)
		return
	}
	if input == nil {
		fail(w, apiError("invalid_activity"))
		return
	}
	h.transaction(w, r, &h.mutations, func(ctx context.Context, tx pgx.Tx, u authUser) (any, int, error) {
		err := leaveActivity(ctx, tx, u.ID, id, h.now())
		return struct {
			Left bool `json:"left"`
		}{true}, http.StatusOK, err
	})
}
func (h *activityHandler) message(w http.ResponseWriter, r *http.Request) {
	id, err := activityPathID(r)
	if err != nil {
		fail(w, err)
		return
	}
	var input activityMessageInput
	if err = decodeJSON(r, &input); err != nil {
		fail(w, err)
		return
	}
	input.Body, input.ClientID, err = normalizeMessageFields(input.Body, input.ClientID)
	if err != nil {
		fail(w, err)
		return
	}
	h.transaction(w, r, &h.messages, func(ctx context.Context, tx pgx.Tx, u authUser) (any, int, error) {
		message, created, err := postActivityMessage(ctx, tx, u.ID, id, input)
		status := http.StatusOK
		if created {
			status = http.StatusCreated
		}
		return struct {
			Message chatMessage `json:"message"`
		}{message}, status, err
	})
}
func (h *activityHandler) action(w http.ResponseWriter, r *http.Request) {
	id, err := activityPathID(r)
	if err != nil {
		fail(w, err)
		return
	}
	var input activityActionInput
	if err = decodeJSON(r, &input); err != nil {
		fail(w, err)
		return
	}
	input, err = normalizeActivityAction(input)
	if err != nil {
		fail(w, err)
		return
	}
	h.transaction(w, r, &h.actions, func(ctx context.Context, tx pgx.Tx, u authUser) (any, int, error) {
		event, wallet, created, err := postActivityAction(ctx, tx, u.ID, id, input, h.now())
		status := http.StatusOK
		if created {
			status = http.StatusCreated
		}
		return struct {
			Event  activityEvent  `json:"event"`
			Wallet activityWallet `json:"wallet"`
		}{event, wallet}, status, err
	})
}
