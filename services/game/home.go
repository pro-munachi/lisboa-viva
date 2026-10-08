package main

import (
	"net/http"

	"github.com/jackc/pgx/v5"
)

type playerHome struct {
	CityID   string `json:"cityId"`
	District string `json:"district"`
}

func validHomeDistrict(district string) bool {
	return district == "Graça" || district == "Baixa" || district == "Alfama"
}

func (s *server) getHome(w http.ResponseWriter, r *http.Request) {
	var home playerHome
	err := s.db.QueryRow(r.Context(), `SELECT city_id,district FROM player_homes WHERE user_id=$1`, currentUser(r).ID).Scan(&home.CityID, &home.District)
	if err == pgx.ErrNoRows {
		// Accounts created before this feature receive the same default home.
		_, err = s.db.Exec(r.Context(), `INSERT INTO player_homes(user_id) VALUES($1)
			ON CONFLICT (user_id) DO NOTHING`, currentUser(r).ID)
		if err == nil {
			err = s.db.QueryRow(r.Context(), `SELECT city_id,district FROM player_homes WHERE user_id=$1`, currentUser(r).ID).Scan(&home.CityID, &home.District)
		}
	}
	if err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, home)
}

func (s *server) updateHome(w http.ResponseWriter, r *http.Request) {
	var input struct {
		District string `json:"district"`
	}
	if err := decodeJSON(r, &input); err != nil {
		fail(w, err)
		return
	}
	if !validHomeDistrict(input.District) {
		fail(w, apiError("invalid_home"))
		return
	}
	var home playerHome
	err := s.db.QueryRow(r.Context(), `INSERT INTO player_homes(user_id,district) VALUES($1,$2)
		ON CONFLICT (user_id) DO UPDATE SET district=EXCLUDED.district
		RETURNING city_id,district`, currentUser(r).ID, input.District).Scan(&home.CityID, &home.District)
	if err != nil {
		fail(w, err)
		return
	}
	respond(w, http.StatusOK, home)
}
