package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"math/big"
	"os"
	"time"
)

type Hub struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	X           int    `json:"x"`
	Y           int    `json:"y"`
	Description string `json:"description"`
}
type Venue struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Hub         string `json:"hub"`
	Type        string `json:"type"`
	Description string `json:"description"`
	Safe        bool   `json:"safe"`
	Opens       int    `json:"opens"`
	Closes      int    `json:"closes"`
	NPC         string `json:"npc"`
	Capacity    int    `json:"capacity"`
}
type Activity struct {
	ID            string         `json:"id"`
	Name          string         `json:"name"`
	Venue         string         `json:"venue"`
	Seconds       int            `json:"seconds"`
	Cost          int64          `json:"cost"`
	Reward        int64          `json:"reward"`
	Skill         string         `json:"skill"`
	Effects       map[string]int `json:"effects"`
	Item          string         `json:"item"`
	Qualification string         `json:"qualification"`
	Requires      string         `json:"requires"`
	Question      string         `json:"question"`
	Options       []string       `json:"options"`
	Answer        string         `json:"-"`
	Cooldown      int            `json:"cooldown"`
}
type Route struct {
	ID          string `json:"id"`
	From        string `json:"fromHub"`
	To          string `json:"toHub"`
	Mode        string `json:"mode"`
	Seconds     int    `json:"seconds"`
	Fare        int64  `json:"fare"`
	Description string `json:"description"`
	Opens       int    `json:"opens"`
	Closes      int    `json:"closes"`
}
type World struct {
	Hubs       []Hub      `json:"hubs"`
	Venues     []Venue    `json:"venues"`
	Activities []Activity `json:"activities"`
	Routes     []Route    `json:"routes"`
}
type State struct {
	Stats          map[string]int `json:"stats"`
	Skills         map[string]int `json:"skills"`
	Story          string         `json:"story"`
	Pronouns       string         `json:"pronouns"`
	Bio            string         `json:"bio"`
	Interests      string         `json:"interests"`
	Color          string         `json:"color"`
	Risk           bool           `json:"risk"`
	DMs            bool           `json:"dms"`
	Quest          int            `json:"quest"`
	Heat           int            `json:"heat"`
	ProtectedUntil time.Time      `json:"protectedUntil"`
	DetainedUntil  time.Time      `json:"detainedUntil"`
	LastRead       time.Time      `json:"lastRead"`
}
type Player struct {
	ID      string    `json:"id"`
	Handle  string    `json:"handle"`
	Name    string    `json:"name"`
	Venue   string    `json:"venue"`
	State   State     `json:"state"`
	Cash    int64     `json:"cash"`
	Bank    int64     `json:"bank"`
	Created time.Time `json:"created"`
	Updated time.Time `json:"-"`
	Admin   bool      `json:"admin"`
}
type Command struct {
	Kind    string `json:"kind"`
	Target  string `json:"target"`
	Amount  int64  `json:"amount"`
	Text    string `json:"text"`
	Choice  string `json:"choice"`
	Key     string `json:"key"`
	Enabled bool   `json:"enabled"`
}
type App struct {
	DB     *pgxpool.Pool
	World  World
	Now    func() time.Time
	Roll   func(int) int
	Origin string
	Secure bool
}

var ctx = context.Background()

func uid() string {
	var b [16]byte
	if _, e := rand.Read(b[:]); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b[:])
}
func hash(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func blob(v any) []byte {
	b, e := json.Marshal(v)
	if e != nil {
		panic(e)
	}
	return b
}
func fail(code string) error { return errors.New(code) }
func (a *App) venue(id string) (Venue, error) {
	for _, v := range a.World.Venues {
		if v.ID == id {
			return v, nil
		}
	}
	return Venue{}, fail("not_found")
}
func (a *App) activity(id string) (Activity, error) {
	for _, v := range a.World.Activities {
		if v.ID == id {
			return v, nil
		}
	}
	return Activity{}, fail("not_found")
}
func openAt(hour, from, to int) bool {
	if from == to || to-from == 24 {
		return true
	}
	if from < to {
		return hour >= from && hour < to
	}
	return hour >= from || hour < to
}
func (a *App) hour() int { return int((a.Now().Unix()+18*60)%1440) / 60 }
func (a *App) transaction(fn func(pgx.Tx) error) error {
	tx, e := a.DB.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(718204)"); e != nil {
		return e
	}
	if e = fn(tx); e != nil {
		return e
	}
	return tx.Commit(ctx)
}
func (a *App) player(tx pgx.Tx, id string) (Player, error) {
	var p Player
	var raw []byte
	e := tx.QueryRow(ctx, `SELECT u.id,u.handle,c.name,c.venue,c.state,c.created_at,c.updated_at,u.admin FROM users u JOIN characters c ON c.user_id=u.id WHERE u.id=$1`, id).Scan(&p.ID, &p.Handle, &p.Name, &p.Venue, &raw, &p.Created, &p.Updated, &p.Admin)
	if e != nil {
		return p, e
	}
	if e = json.Unmarshal(raw, &p.State); e != nil {
		return p, e
	}
	e = tx.QueryRow(ctx, "SELECT balance FROM wallets WHERE id=$1", id+":cash").Scan(&p.Cash)
	if e != nil {
		return p, e
	}
	e = tx.QueryRow(ctx, "SELECT balance FROM wallets WHERE id=$1", id+":bank").Scan(&p.Bank)
	return p, e
}
func (a *App) save(tx pgx.Tx, p Player) error {
	_, e := tx.Exec(ctx, "UPDATE characters SET state=$2,venue=$3,updated_at=$4 WHERE user_id=$1", p.ID, blob(p.State), p.Venue, a.Now())
	return e
}
func (a *App) event(tx pgx.Tx, id, kind string) error {
	var user any
	if id != "" {
		user = id
	}
	_, e := tx.Exec(ctx, "INSERT INTO outbox(user_id,kind,created_at) VALUES($1,$2,$3)", user, kind, a.Now())
	return e
}
func (a *App) money(tx pgx.Tx, actor, kind, note, from, to string, amount int64) error {
	if amount <= 0 || amount > 100000000 {
		return fail("invalid_amount")
	}
	var n int64
	if e := tx.QueryRow(ctx, "SELECT balance FROM wallets WHERE id=$1 FOR UPDATE", from).Scan(&n); e != nil {
		return e
	}
	if from != "system" && n < amount {
		return fail("insufficient")
	}
	id := uid()
	if _, e := tx.Exec(ctx, "INSERT INTO transactions VALUES($1,$2,$3,$4,$5)", id, actor, kind, note, a.Now()); e != nil {
		return e
	}
	if _, e := tx.Exec(ctx, "UPDATE wallets SET balance=balance-$2 WHERE id=$1", from, amount); e != nil {
		return e
	}
	result, e := tx.Exec(ctx, "UPDATE wallets SET balance=balance+$2 WHERE id=$1", to, amount)
	if e != nil {
		return e
	}
	if result.RowsAffected() != 1 {
		return fail("not_found")
	}
	_, e = tx.Exec(ctx, "INSERT INTO ledger(transaction_id,wallet_id,amount) VALUES($1,$2,$4),($1,$3,-$4)", id, to, from, amount)
	return e
}
func loadWorld(path string) (World, error) {
	var w World
	b, e := os.ReadFile(path)
	if e != nil {
		return w, e
	}
	e = json.Unmarshal(b, &w)
	if e != nil {
		return w, e
	}
	var raw struct {
		Activities []struct {
			ID     string `json:"id"`
			Answer string `json:"answer"`
		}
	}
	if e = json.Unmarshal(b, &raw); e != nil {
		return w, e
	}
	for i := range w.Activities {
		w.Activities[i].Answer = raw.Activities[i].Answer
	}
	return w, nil
}
func random(n int) int {
	v, e := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if e != nil {
		panic(e)
	}
	return int(v.Int64())
}
func requireOK(e error) {
	if e != nil {
		panic(fmt.Sprintf("startup: %v", e))
	}
}
