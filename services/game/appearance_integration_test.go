package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAppearanceBodyTypePostgresLegacyBackfill(t *testing.T) {
	ctx, pool := isolatedChatPool(t)
	var id string
	if err := pool.QueryRow(ctx, `INSERT INTO users(handle,email,user_type,adult_confirmed_at)
		VALUES('legacy_body_fixture','legacy-body@example.test','tourist',now()) RETURNING id::text`).Scan(&id); err != nil {
		t.Fatal("could not create isolated legacy account")
	}
	if _, err := pool.Exec(ctx, `INSERT INTO character_appearances
		(user_id,outfit_style,top_color,bottom_color,hair_style,hair_color,skin_tone,shoe_color)
		VALUES($1,'dress','#c19a4b','#6b5147','bun','#b98452','#5b3d30','#292d31')`, id); err != nil {
		t.Fatal("could not create isolated legacy appearance")
	}
	// Only this randomly named test schema is changed. Model a database that
	// predates the additive body-type migration while retaining its old choices.
	if _, err := pool.Exec(ctx, "ALTER TABLE character_appearances DROP COLUMN body_type"); err != nil {
		t.Fatal("could not model the pre-body-type schema")
	}
	if _, err := pool.Exec(ctx, "DELETE FROM schema_migrations WHERE name='009_character_body_type.sql'"); err != nil {
		t.Fatal("could not model the legacy migration ledger")
	}
	root, err := filepath.Abs("../..")
	if err != nil || migrate(ctx, pool, root) != nil || migrate(ctx, pool, root) != nil {
		t.Fatal("body-type migration did not apply idempotently")
	}
	want := characterAppearance{
		BodyType: "male", OutfitStyle: "dress", TopColor: "#c19a4b", BottomColor: "#6b5147",
		HairStyle: "bun", HairColor: "#b98452", SkinTone: "#5b3d30", ShoeColor: "#292d31",
	}
	user, err := loadUser(ctx, pool, "u.id=$1", id)
	if err != nil || user.Appearance != want {
		t.Fatalf("legacy backfill lost saved choices: %#v, %v", user.Appearance, err)
	}
	var recorded string
	data, err := os.ReadFile("../../db/migrations/009_character_body_type.sql")
	if err != nil || pool.QueryRow(ctx, "SELECT checksum FROM schema_migrations WHERE name='009_character_body_type.sql'").Scan(&recorded) != nil || recorded != checksum(data) {
		t.Fatal("the new migration checksum was not recorded")
	}
	if _, err := pool.Exec(ctx, "UPDATE character_appearances SET body_type='female' WHERE user_id=$1", id); err != nil {
		t.Fatal("the database rejected the supported female body type")
	}
	if _, err := pool.Exec(ctx, "UPDATE character_appearances SET body_type='invented' WHERE user_id=$1", id); err == nil {
		t.Fatal("the database accepted an unsupported body type")
	}
	if _, err := pool.Exec(ctx, "UPDATE character_appearances SET body_type=NULL WHERE user_id=$1", id); err == nil {
		t.Fatal("the database accepted a null body type")
	}
	user, err = loadUser(ctx, pool, "u.id=$1", id)
	if err != nil || user.Appearance.BodyType != "female" {
		t.Fatal("rejected database values changed the supported saved body type")
	}
}
