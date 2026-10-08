package main

import (
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	minPresenceLatitude  = 38.683
	maxPresenceLatitude  = 38.832
	minPresenceLongitude = -9.435
	maxPresenceLongitude = -9.085
	maxPresenceRadius    = 25000.0
	presenceTTL          = 45 * time.Second
)

type presenceInput struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Area      string  `json:"area"`
	PlaceID   string  `json:"placeId,omitempty"`
}

type nearbyPlayer struct {
	ID             string              `json:"id"`
	Handle         string              `json:"handle"`
	UserType       string              `json:"userType"`
	Latitude       float64             `json:"latitude"`
	Longitude      float64             `json:"longitude"`
	Area           string              `json:"area"`
	PlaceID        string              `json:"placeId,omitempty"`
	DistanceMetres int                 `json:"distanceMetres"`
	LastSeenAt     time.Time           `json:"lastSeenAt"`
	Appearance     characterAppearance `json:"appearance"`
}

func normalizePresence(input presenceInput) (presenceInput, error) {
	input.Area = strings.TrimSpace(input.Area)
	if math.IsNaN(input.Latitude) || math.IsInf(input.Latitude, 0) ||
		math.IsNaN(input.Longitude) || math.IsInf(input.Longitude, 0) ||
		input.Latitude < minPresenceLatitude || input.Latitude > maxPresenceLatitude ||
		input.Longitude < minPresenceLongitude || input.Longitude > maxPresenceLongitude ||
		len(input.Area) < 1 || len(input.Area) > 80 || strings.ContainsAny(input.Area, "\r\n\x00") ||
		(input.PlaceID != "" && (len(input.PlaceID) > 145 || !validChatRoom("lisbon:hotspot:"+input.PlaceID))) {
		return input, apiError("invalid_presence")
	}
	return input, nil
}

func presenceQuery(r *http.Request) (latitude, longitude, radius float64, err error) {
	latitude, err = strconv.ParseFloat(r.URL.Query().Get("latitude"), 64)
	if err != nil {
		return 0, 0, 0, apiError("invalid_presence")
	}
	longitude, err = strconv.ParseFloat(r.URL.Query().Get("longitude"), 64)
	if err != nil {
		return 0, 0, 0, apiError("invalid_presence")
	}
	radius = 3500
	if value := r.URL.Query().Get("radius"); value != "" {
		radius, err = strconv.ParseFloat(value, 64)
		if err != nil {
			return 0, 0, 0, apiError("invalid_presence")
		}
	}
	if _, err = normalizePresence(presenceInput{Latitude: latitude, Longitude: longitude, Area: "query"}); err != nil || radius < 100 || radius > maxPresenceRadius || math.IsNaN(radius) || math.IsInf(radius, 0) {
		return 0, 0, 0, apiError("invalid_presence")
	}
	return latitude, longitude, radius, nil
}

func (s *server) updatePresence(w http.ResponseWriter, r *http.Request) {
	var input presenceInput
	if err := decodeJSON(r, &input); err != nil {
		fail(w, err)
		return
	}
	input, err := normalizePresence(input)
	if err != nil {
		fail(w, err)
		return
	}
	user := currentUser(r)
	_, err = s.db.Exec(r.Context(), `INSERT INTO player_presence(user_id,latitude,longitude,area,place_id,last_seen_at,updated_at)
		VALUES($1,$2,$3,$4,NULLIF($5,''),$6,$6)
		ON CONFLICT (user_id) DO UPDATE SET latitude=EXCLUDED.latitude,
		longitude=EXCLUDED.longitude,area=EXCLUDED.area,place_id=EXCLUDED.place_id,last_seen_at=EXCLUDED.last_seen_at,
		updated_at=EXCLUDED.updated_at`, user.ID, input.Latitude, input.Longitude, input.Area, input.PlaceID, s.now())
	if err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, map[string]any{"online": true, "expiresInSeconds": int(presenceTTL.Seconds())})
}

func (s *server) clearPresence(w http.ResponseWriter, r *http.Request) {
	if _, err := s.db.Exec(r.Context(), "DELETE FROM player_presence WHERE user_id=$1", currentUser(r).ID); err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, map[string]bool{"online": false})
}

func (s *server) nearbyPlayers(w http.ResponseWriter, r *http.Request) {
	latitude, longitude, radius, err := presenceQuery(r)
	if err != nil {
		fail(w, err)
		return
	}
	user := currentUser(r)
	rows, err := s.db.Query(r.Context(), `SELECT u.id::text,u.handle,u.user_type::text,
		p.latitude,p.longitude,p.area,COALESCE(p.place_id,''),
		ROUND(SQRT(POWER((p.latitude-$2)*111320,2)+POWER((p.longitude-$3)*87300,2)))::int AS distance_metres,
		p.last_seen_at,ca.body_type,ca.outfit_style,ca.top_color,ca.bottom_color,ca.hair_style,ca.hair_color,ca.skin_tone,ca.shoe_color
		FROM player_presence p JOIN users u ON u.id=p.user_id
		JOIN character_appearances ca ON ca.user_id=u.id
		WHERE p.user_id<>$1 AND u.account_status='active' AND p.last_seen_at>$4
		AND POWER((p.latitude-$2)*111320,2)+POWER((p.longitude-$3)*87300,2)<=POWER($5::double precision,2)
		ORDER BY distance_metres,p.last_seen_at DESC LIMIT 40`, user.ID, latitude, longitude, s.now().Add(-presenceTTL), radius)
	if err != nil {
		fail(w, err)
		return
	}
	defer rows.Close()
	players := []nearbyPlayer{}
	for rows.Next() {
		var player nearbyPlayer
		if err = rows.Scan(&player.ID, &player.Handle, &player.UserType, &player.Latitude, &player.Longitude, &player.Area, &player.PlaceID, &player.DistanceMetres, &player.LastSeenAt,
			&player.Appearance.BodyType, &player.Appearance.OutfitStyle, &player.Appearance.TopColor, &player.Appearance.BottomColor,
			&player.Appearance.HairStyle, &player.Appearance.HairColor, &player.Appearance.SkinTone, &player.Appearance.ShoeColor); err != nil {
			fail(w, err)
			return
		}
		players = append(players, player)
	}
	if err = rows.Err(); err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, map[string]any{"players": players, "expiresInSeconds": int(presenceTTL.Seconds())})
}

// Venue rosters are requested only while the directory is open. Keeping them
// separate from the heartbeat prevents a crowded room from sending every
// player's appearance to every other player every ten seconds.
func (s *server) venuePlayers(w http.ResponseWriter, r *http.Request) {
	placeID := r.URL.Query().Get("placeId")
	cursor := r.URL.Query().Get("cursor")
	if placeID == "" || len(placeID) > 145 || !validChatRoom("lisbon:hotspot:"+placeID) ||
		(cursor != "" && !chatUUID.MatchString(cursor)) {
		fail(w, apiError("invalid_presence"))
		return
	}
	user := currentUser(r)
	cutoff := s.now().Add(-presenceTTL)
	var present bool
	if err := s.db.QueryRow(r.Context(), `SELECT EXISTS(
		SELECT 1 FROM player_presence WHERE user_id=$1 AND place_id=$2 AND last_seen_at>$3
	)`, user.ID, placeID, cutoff).Scan(&present); err != nil {
		fail(w, err)
		return
	}
	if !present {
		fail(w, apiError("chat_presence_required"))
		return
	}
	var total any
	if cursor == "" {
		var count int64
		if err := s.db.QueryRow(r.Context(), `SELECT count(*) FROM player_presence p
		JOIN users u ON u.id=p.user_id
		WHERE p.place_id=$1 AND p.user_id<>$2 AND p.last_seen_at>$3 AND u.account_status='active'`,
			placeID, user.ID, cutoff).Scan(&count); err != nil {
			fail(w, err)
			return
		}
		total = count
	}
	query := `SELECT u.id::text,u.handle,u.user_type::text,
		p.latitude,p.longitude,p.area,COALESCE(p.place_id,''),0,p.last_seen_at,
		ca.body_type,ca.outfit_style,ca.top_color,ca.bottom_color,ca.hair_style,ca.hair_color,ca.skin_tone,ca.shoe_color
		FROM player_presence p JOIN users u ON u.id=p.user_id
		JOIN character_appearances ca ON ca.user_id=u.id
		WHERE p.place_id=$1 AND p.user_id<>$2 AND p.last_seen_at>$3 AND u.account_status='active'`
	args := []any{placeID, user.ID, cutoff}
	if cursor != "" {
		query += ` AND p.user_id>$4::uuid`
		args = append(args, cursor)
	}
	query += ` ORDER BY p.user_id LIMIT 26`
	rows, err := s.db.Query(r.Context(), query, args...)
	if err != nil {
		fail(w, err)
		return
	}
	defer rows.Close()
	players := []nearbyPlayer{}
	for rows.Next() {
		var player nearbyPlayer
		if err = rows.Scan(&player.ID, &player.Handle, &player.UserType, &player.Latitude, &player.Longitude,
			&player.Area, &player.PlaceID, &player.DistanceMetres, &player.LastSeenAt,
			&player.Appearance.BodyType, &player.Appearance.OutfitStyle, &player.Appearance.TopColor,
			&player.Appearance.BottomColor, &player.Appearance.HairStyle, &player.Appearance.HairColor,
			&player.Appearance.SkinTone, &player.Appearance.ShoeColor); err != nil {
			fail(w, err)
			return
		}
		players = append(players, player)
	}
	if err = rows.Err(); err != nil {
		fail(w, err)
		return
	}
	var nextCursor any
	if len(players) > 25 {
		players = players[:25]
		nextCursor = players[len(players)-1].ID
	}
	respond(w, http.StatusOK, map[string]any{
		"players": players, "total": total, "nextCursor": nextCursor,
		"expiresInSeconds": int(presenceTTL.Seconds()),
	})
}
