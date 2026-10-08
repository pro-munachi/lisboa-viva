package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

func loadActivityWallet(ctx context.Context, tx pgx.Tx, userID string, lock bool) (activityWallet, error) {
	wallet := activityWallet{Currency: "ROAM credits"}
	// The initial ledger entry and wallet either both commit or neither does.
	_, err := tx.Exec(ctx, `WITH granted AS (
		INSERT INTO activity_wallets(user_id,balance) VALUES($1,200)
		ON CONFLICT(user_id) DO NOTHING RETURNING user_id
	) INSERT INTO activity_credit_ledger(user_id,kind,delta)
		SELECT user_id,'initial',200 FROM granted`, userID)
	if err != nil {
		return wallet, err
	}
	query := `SELECT balance FROM activity_wallets WHERE user_id=$1`
	if lock {
		query += ` FOR UPDATE`
	}
	err = tx.QueryRow(ctx, query, userID).Scan(&wallet.Balance)
	return wallet, err
}

const activitySummaryColumns = `a.id::text,a.title,a.category,a.traveller_type,a.venue_id,a.starts_at,a.capacity,
	(SELECT count(*) FROM activity_members m JOIN users member ON member.id=m.user_id
	 WHERE m.activity_id=a.id AND m.left_at IS NULL AND member.account_status='active' AND member.deleted_at IS NULL),
	host.id::text,host.handle,
	EXISTS(SELECT 1 FROM activity_members own WHERE own.activity_id=a.id AND own.user_id=$1 AND own.left_at IS NULL),
	a.created_at`

func scanActivitySummary(row pgx.Row) (activitySummary, error) {
	var summary activitySummary
	var start, created time.Time
	err := row.Scan(&summary.ID, &summary.Title, &summary.Category, &summary.TravellerType, &summary.VenueID, &start, &summary.Capacity,
		&summary.MemberCount, &summary.Host.ID, &summary.Host.Handle, &summary.Joined, &created)
	summary.StartsAt = start.UTC().Format(time.RFC3339Nano)
	summary.CreatedAt = created.UTC().Format(time.RFC3339Nano)
	return summary, err
}

func listActivities(ctx context.Context, tx pgx.Tx, userID string, now time.Time) ([]activitySummary, error) {
	result := make([]activitySummary, 0)
	rows, err := tx.Query(ctx, `SELECT `+activitySummaryColumns+`
		FROM activities a JOIN users host ON host.id=a.host_id
		WHERE a.closed_at IS NULL AND a.starts_at >= $2 AND host.account_status='active' AND host.deleted_at IS NULL
		ORDER BY a.starts_at ASC,a.created_at DESC,a.id LIMIT 60`, userID, now.Add(-6*time.Hour))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		summary, err := scanActivitySummary(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, summary)
	}
	return result, rows.Err()
}

type lockedActivity struct {
	ID, HostID, Category, VenueID string
	Capacity                      int
}

func lockActivity(ctx context.Context, tx pgx.Tx, id string) (lockedActivity, error) {
	var activity lockedActivity
	var closed *time.Time
	err := tx.QueryRow(ctx, `SELECT a.id::text,a.host_id::text,a.category,a.venue_id,a.capacity,a.closed_at
		FROM activities a JOIN users host ON host.id=a.host_id
		WHERE a.id=$1 AND host.account_status='active' AND host.deleted_at IS NULL FOR UPDATE OF a FOR SHARE OF host`, id).
		Scan(&activity.ID, &activity.HostID, &activity.Category, &activity.VenueID, &activity.Capacity, &closed)
	if errors.Is(err, pgx.ErrNoRows) {
		return activity, apiError("activity_not_found")
	}
	if err != nil {
		return activity, err
	}
	if closed != nil {
		return activity, apiError("activity_closed")
	}
	return activity, nil
}

type currentActivityMember struct {
	activityPerson
	SocialOptIn bool
	JoinedAt    time.Time
}

func requireActivityMember(ctx context.Context, tx pgx.Tx, userID, id string) (currentActivityMember, error) {
	var member currentActivityMember
	err := tx.QueryRow(ctx, `SELECT u.id::text,u.handle,m.social_opt_in,m.joined_at FROM activity_members m JOIN users u ON u.id=m.user_id
		WHERE m.activity_id=$1 AND m.user_id=$2 AND m.left_at IS NULL AND u.account_status='active' AND u.deleted_at IS NULL FOR SHARE OF u`, id, userID).
		Scan(&member.ID, &member.Handle, &member.SocialOptIn, &member.JoinedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return member, apiError("activity_membership_required")
	}
	return member, err
}

func loadActivityRoom(ctx context.Context, tx pgx.Tx, userID, id string) (activityRoom, error) {
	room := activityRoom{Members: make([]activityMember, 0), Messages: make([]chatMessage, 0), Events: make([]activityEvent, 0)}
	if _, err := lockActivity(ctx, tx, id); err != nil {
		return room, err
	}
	if _, err := requireActivityMember(ctx, tx, userID, id); err != nil {
		return room, err
	}
	summary, err := scanActivitySummary(tx.QueryRow(ctx, `SELECT `+activitySummaryColumns+` FROM activities a JOIN users host ON host.id=a.host_id WHERE a.id=$2`, userID, id))
	if err != nil {
		return room, err
	}
	room.activitySummary = summary
	rows, err := tx.Query(ctx, `SELECT u.id::text,u.handle,u.user_type::text,m.joined_at,m.social_opt_in
		FROM activity_members m JOIN users u ON u.id=m.user_id
		WHERE m.activity_id=$1 AND m.left_at IS NULL AND u.account_status='active' AND u.deleted_at IS NULL
		ORDER BY m.joined_at,u.id LIMIT 12`, id)
	if err != nil {
		return room, err
	}
	for rows.Next() {
		var member activityMember
		var joined time.Time
		if err = rows.Scan(&member.ID, &member.Handle, &member.UserType, &joined, &member.SocialOptIn); err != nil {
			rows.Close()
			return room, err
		}
		member.JoinedAt = joined.UTC().Format(time.RFC3339Nano)
		room.Members = append(room.Members, member)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return room, err
	}
	rows, err = tx.Query(ctx, `SELECT messages.id,'activity:'||messages.activity_id::text,messages.body,messages.sent_at,u.id::text,u.handle,u.user_type::text
		FROM (SELECT m.* FROM activity_messages m JOIN users author ON author.id=m.user_id
		WHERE m.activity_id=$1 AND author.account_status='active' AND author.deleted_at IS NULL ORDER BY m.id DESC LIMIT 50) messages
		JOIN users u ON u.id=messages.user_id ORDER BY messages.id`, id)
	if err != nil {
		return room, err
	}
	for rows.Next() {
		message, err := scanChatMessage(rows)
		if err != nil {
			rows.Close()
			return room, err
		}
		room.Messages = append(room.Messages, message)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return room, err
	}
	rows, err = tx.Query(ctx, `SELECT `+activityEventColumns+` FROM (
		SELECT e.* FROM activity_events e JOIN users author ON author.id=e.actor_id LEFT JOIN users recipient ON recipient.id=e.target_id
		WHERE e.activity_id=$1 AND author.account_status='active' AND author.deleted_at IS NULL
		AND (e.target_id IS NULL OR (recipient.account_status='active' AND recipient.deleted_at IS NULL))
		ORDER BY e.sequence DESC LIMIT 30) e JOIN users actor ON actor.id=e.actor_id LEFT JOIN users target ON target.id=e.target_id
		ORDER BY e.sequence`, id)
	if err != nil {
		return room, err
	}
	defer rows.Close()
	for rows.Next() {
		event, err := scanActivityEvent(rows)
		if err != nil {
			return room, err
		}
		room.Events = append(room.Events, event)
	}
	return room, rows.Err()
}

func activityNonceLock(ctx context.Context, tx pgx.Tx, scope, userID, clientID string) error {
	_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, "roam:activity:"+scope+":"+userID+":"+clientID)
	return err
}

func createActivity(ctx context.Context, tx pgx.Tx, userID string, input activityCreateInput, now time.Time) (string, bool, error) {
	if err := activityNonceLock(ctx, tx, "create", userID, input.ClientID); err != nil {
		return "", false, err
	}
	payload := activityPayload(input)
	var id, oldPayload string
	err := tx.QueryRow(ctx, `SELECT id::text,creation_payload FROM activities WHERE host_id=$1 AND client_id=$2`, userID, input.ClientID).Scan(&id, &oldPayload)
	if err == nil {
		if oldPayload != payload {
			return "", false, apiError("nonce_conflict")
		}
		return id, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", false, err
	}
	if !validActivityStart(input, now) {
		return "", false, apiError("invalid_activity")
	}
	start, _ := time.Parse(time.RFC3339Nano, input.StartsAt)
	err = tx.QueryRow(ctx, `INSERT INTO activities(host_id,title,category,traveller_type,venue_id,starts_at,capacity,client_id,creation_payload)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id::text`, userID, input.Title, input.Category, input.TravellerType, input.VenueID, start, input.Capacity, input.ClientID, payload).Scan(&id)
	if err != nil {
		return "", false, err
	}
	_, err = tx.Exec(ctx, `INSERT INTO activity_members(activity_id,user_id,social_opt_in) VALUES($1,$2,false)`, id, userID)
	return id, true, err
}

func joinActivity(ctx context.Context, tx pgx.Tx, userID, id string, socialOptIn bool) error {
	activity, err := lockActivity(ctx, tx, id)
	if err != nil {
		return err
	}
	var already bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM activity_members WHERE activity_id=$1 AND user_id=$2 AND left_at IS NULL)`, id, userID).Scan(&already)
	if err != nil {
		return err
	}
	if already {
		_, err = tx.Exec(ctx, `UPDATE activity_members SET social_opt_in=$3 WHERE activity_id=$1 AND user_id=$2`, id, userID, socialOptIn)
		return err
	}
	// End inactive membership sessions before releasing their seats. Otherwise
	// reactivating an account could silently overfill a room and restore opt-in.
	_, err = tx.Exec(ctx, `UPDATE activity_members m SET left_at=clock_timestamp(),social_opt_in=false
		WHERE m.activity_id=$1 AND m.left_at IS NULL AND EXISTS(
			SELECT 1 FROM users u WHERE u.id=m.user_id AND (u.account_status<>'active' OR u.deleted_at IS NOT NULL))`, id)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE activity_invitations i SET status='expired' WHERE i.activity_id=$1 AND i.status='pending'
		AND (NOT EXISTS(SELECT 1 FROM activity_members m WHERE m.activity_id=i.activity_id AND m.user_id=i.actor_id AND m.left_at IS NULL)
		OR NOT EXISTS(SELECT 1 FROM activity_members m WHERE m.activity_id=i.activity_id AND m.user_id=i.target_id AND m.left_at IS NULL))`, id)
	if err != nil {
		return err
	}
	var count int
	// Count every reserved seat: status updates outside this transaction must
	// not change the capacity invariant between checking and inserting a member.
	err = tx.QueryRow(ctx, `SELECT count(*) FROM activity_members WHERE activity_id=$1 AND left_at IS NULL`, id).Scan(&count)
	if err != nil {
		return err
	}
	if count >= activity.Capacity {
		return apiError("activity_full")
	}
	_, err = tx.Exec(ctx, `INSERT INTO activity_members(activity_id,user_id,social_opt_in) VALUES($1,$2,$3)
		ON CONFLICT(activity_id,user_id) DO UPDATE SET social_opt_in=EXCLUDED.social_opt_in,left_at=NULL,joined_at=clock_timestamp()`, id, userID, socialOptIn)
	return err
}

func leaveActivity(ctx context.Context, tx pgx.Tx, userID, id string, now time.Time) error {
	activity, err := lockActivity(ctx, tx, id)
	if err != nil {
		return err
	}
	var exists bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM activity_members WHERE activity_id=$1 AND user_id=$2)`, id, userID).Scan(&exists)
	if err != nil {
		return err
	}
	if !exists {
		return apiError("activity_membership_required")
	}
	if activity.HostID == userID {
		_, err = tx.Exec(ctx, `UPDATE activities SET closed_at=$2 WHERE id=$1`, id, now)
		if err != nil {
			return err
		}
	}
	_, err = tx.Exec(ctx, `UPDATE activity_members SET left_at=COALESCE(left_at,$3),social_opt_in=false WHERE activity_id=$1 AND user_id=$2`, id, userID, now)
	if err != nil {
		return err
	}
	// A leave ends the invitation session, even if this player later rejoins.
	_, err = tx.Exec(ctx, `UPDATE activity_invitations SET status='expired' WHERE activity_id=$1 AND status='pending' AND (actor_id=$2 OR target_id=$2)`, id, userID)
	return err
}

func postActivityMessage(ctx context.Context, tx pgx.Tx, userID, id string, input activityMessageInput) (chatMessage, bool, error) {
	var message chatMessage
	if err := activityNonceLock(ctx, tx, "message", userID, input.ClientID); err != nil {
		return message, false, err
	}
	if _, err := lockActivity(ctx, tx, id); err != nil {
		return message, false, err
	}
	if _, err := requireActivityMember(ctx, tx, userID, id); err != nil {
		return message, false, err
	}
	message, err := scanChatMessage(tx.QueryRow(ctx, `SELECT m.id,'activity:'||m.activity_id::text,m.body,m.sent_at,u.id::text,u.handle,u.user_type::text
		FROM activity_messages m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.client_id=$2`, userID, input.ClientID))
	if err == nil {
		if message.Room != "activity:"+id || message.Body != input.Body {
			return message, false, apiError("nonce_conflict")
		}
		return message, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return message, false, err
	}
	message, err = scanChatMessage(tx.QueryRow(ctx, `WITH inserted AS (
		INSERT INTO activity_messages(activity_id,user_id,client_id,body) VALUES($1,$2,$3,$4) RETURNING *
	) SELECT m.id,'activity:'||m.activity_id::text,m.body,m.sent_at,u.id::text,u.handle,u.user_type::text FROM inserted m JOIN users u ON u.id=m.user_id`, id, userID, input.ClientID, input.Body))
	return message, true, err
}

const activityEventColumns = `e.id::text,e.kind,actor.id::text,actor.handle,target.id::text,target.handle,e.label,e.created_at,COALESCE(e.invite_id::text,'')`

func scanActivityEvent(row pgx.Row) (activityEvent, error) {
	var event activityEvent
	var targetID, targetHandle *string
	var created time.Time
	err := row.Scan(&event.ID, &event.Kind, &event.Actor.ID, &event.Actor.Handle, &targetID, &targetHandle, &event.Label, &created, &event.InviteID)
	if targetID != nil && targetHandle != nil {
		event.Target = &activityPerson{*targetID, *targetHandle}
	}
	event.CreatedAt = created.UTC().Format(time.RFC3339Nano)
	return event, err
}

func requireActivityPresence(ctx context.Context, tx pgx.Tx, userID, venueID string, now time.Time) error {
	var place string
	err := tx.QueryRow(ctx, `SELECT place_id FROM player_presence WHERE user_id=$1 AND place_id=$2 AND last_seen_at>$3 FOR SHARE`, userID, venueID, now.Add(-presenceTTL)).Scan(&place)
	if errors.Is(err, pgx.ErrNoRows) {
		return apiError("activity_presence_required")
	}
	return err
}

var activityDrinkCosts = map[string]int{"coffee": 8, "mocktail": 12, "beer": 15}

func postActivityAction(ctx context.Context, tx pgx.Tx, userID, id string, input activityActionInput, now time.Time) (activityEvent, activityWallet, bool, error) {
	var event activityEvent
	var wallet activityWallet
	if err := activityNonceLock(ctx, tx, "action", userID, input.ClientID); err != nil {
		return event, wallet, false, err
	}
	activity, err := lockActivity(ctx, tx, id)
	if err != nil {
		return event, wallet, false, err
	}
	actor, err := requireActivityMember(ctx, tx, userID, id)
	if err != nil {
		return event, wallet, false, err
	}
	payload := activityPayload(struct {
		ActivityID string              `json:"activityId"`
		Input      activityActionInput `json:"input"`
	}{id, input})
	var savedID, oldPayload string
	err = tx.QueryRow(ctx, `SELECT id::text,action_payload FROM activity_events WHERE actor_id=$1 AND client_id=$2`, userID, input.ClientID).Scan(&savedID, &oldPayload)
	if err == nil {
		if oldPayload != payload {
			return event, wallet, false, apiError("nonce_conflict")
		}
		event, err = scanActivityEvent(tx.QueryRow(ctx, `SELECT `+activityEventColumns+` FROM activity_events e JOIN users actor ON actor.id=e.actor_id LEFT JOIN users target ON target.id=e.target_id
			WHERE e.id=$1 AND (e.target_id IS NULL OR (target.account_status='active' AND target.deleted_at IS NULL))`, savedID))
		if errors.Is(err, pgx.ErrNoRows) {
			err = apiError("activity_membership_required")
		}
		if err != nil {
			return event, wallet, false, err
		}
		wallet, err = loadActivityWallet(ctx, tx, userID, false)
		return event, wallet, false, err
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return event, wallet, false, err
	}
	if input.Kind != "decline-challenge" {
		if err = requireActivityPresence(ctx, tx, userID, activity.VenueID, now); err != nil {
			return event, wallet, false, err
		}
	}
	var target *currentActivityMember
	if input.TargetID != "" {
		if input.TargetID == userID {
			return event, wallet, false, apiError("invalid_action")
		}
		member, err := requireActivityMember(ctx, tx, input.TargetID, id)
		if err != nil {
			return event, wallet, false, err
		}
		if err = requireActivityPresence(ctx, tx, member.ID, activity.VenueID, now); err != nil {
			return event, wallet, false, err
		}
		target = &member
	}
	cost := 0
	var inviteID any
	var targetID any
	if target != nil {
		targetID = target.ID
	}
	label := ""
	switch input.Kind {
	case "drink":
		if !((activity.Category == "coffee" && input.Item == "coffee") ||
			(activity.Category == "nightlife" && (input.Item == "mocktail" || input.Item == "beer"))) {
			return event, wallet, false, apiError("invalid_action")
		}
		cost = activityDrinkCosts[input.Item]
		label = fmt.Sprintf("@%s picked up a %s", actor.Handle, input.Item)
	case "wave":
		label = "@" + actor.Handle + " waved hello"
		if target != nil {
			label += " to @" + target.Handle
		}
	case "dance":
		label = "@" + actor.Handle + " started dancing"
		if target != nil {
			label += " with @" + target.Handle
		}
	case "compliment":
		label = "@" + actor.Handle + " shared a kind compliment"
		if target != nil {
			label += " with @" + target.Handle
		}
	case "flirt":
		if !actor.SocialOptIn || !target.SocialOptIn {
			return event, wallet, false, apiError("social_opt_in_required")
		}
		label = "@" + actor.Handle + " sent a friendly flirt to @" + target.Handle
	case "challenge":
		if activity.Category != "nightlife" {
			return event, wallet, false, apiError("invalid_action")
		}
		_, err = tx.Exec(ctx, `UPDATE activity_invitations SET status='expired' WHERE activity_id=$1 AND status='pending' AND expires_at<=$2`, id, now)
		if err != nil {
			return event, wallet, false, err
		}
		var pending bool
		err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM activity_invitations WHERE activity_id=$1 AND status='pending'
			AND ((actor_id=$2 AND target_id=$3) OR (actor_id=$3 AND target_id=$2)))`, id, userID, target.ID).Scan(&pending)
		if err != nil {
			return event, wallet, false, err
		}
		if pending {
			return event, wallet, false, apiError("invitation_unavailable")
		}
		label = "@" + actor.Handle + " invited @" + target.Handle + " to a playful showdown"
	case "accept-challenge", "decline-challenge":
		var originalActor, originalTarget, status string
		var expires, actorJoined, targetJoined time.Time
		err = tx.QueryRow(ctx, `SELECT actor_id::text,target_id::text,status,expires_at,actor_joined_at,target_joined_at
			FROM activity_invitations WHERE id=$1 AND activity_id=$2 FOR UPDATE`, input.InviteID, id).
			Scan(&originalActor, &originalTarget, &status, &expires, &actorJoined, &targetJoined)
		if errors.Is(err, pgx.ErrNoRows) {
			err = apiError("invitation_unavailable")
		}
		if err != nil {
			return event, wallet, false, err
		}
		if originalTarget != userID {
			return event, wallet, false, apiError("invitation_target_required")
		}
		if status != "pending" || !now.Before(expires) || !actor.JoinedAt.Equal(targetJoined) {
			return event, wallet, false, apiError("invitation_unavailable")
		}
		member, err := requireActivityMember(ctx, tx, originalActor, id)
		if err != nil {
			return event, wallet, false, apiError("invitation_unavailable")
		}
		if !member.JoinedAt.Equal(actorJoined) {
			return event, wallet, false, apiError("invitation_unavailable")
		}
		if input.Kind == "accept-challenge" {
			if err = requireActivityPresence(ctx, tx, member.ID, activity.VenueID, now); err != nil {
				return event, wallet, false, err
			}
		}
		target = &member
		targetID = member.ID
		inviteID = input.InviteID
		if input.Kind == "accept-challenge" {
			label = "@" + actor.Handle + " and @" + member.Handle + " agreed to a playful scuffle"
		} else {
			label = "@" + actor.Handle + " declined @" + member.Handle + "'s playful showdown"
		}
	}
	wallet, err = loadActivityWallet(ctx, tx, userID, true)
	if err != nil {
		return event, wallet, false, err
	}
	if wallet.Balance < cost {
		return event, wallet, false, apiError("insufficient_credits")
	}
	event, err = scanActivityEvent(tx.QueryRow(ctx, `WITH inserted AS (
		INSERT INTO activity_events(activity_id,actor_id,target_id,kind,label,invite_id,client_id,action_payload)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
	) SELECT `+activityEventColumns+` FROM inserted e JOIN users actor ON actor.id=e.actor_id LEFT JOIN users target ON target.id=e.target_id`, id, userID, targetID, input.Kind, label, inviteID, input.ClientID, payload))
	if err != nil {
		return event, wallet, false, err
	}
	if input.Kind == "challenge" {
		// The challenge itself is the invitation identity exposed to clients.
		_, err = tx.Exec(ctx, `UPDATE activity_events SET invite_id=id WHERE id=$1`, event.ID)
		if err == nil {
			_, err = tx.Exec(ctx, `INSERT INTO activity_invitations(id,activity_id,actor_id,target_id,actor_joined_at,target_joined_at,expires_at)
			VALUES($1,$2,$3,$4,$5,$6,$7)`, event.ID, id, userID, target.ID, actor.JoinedAt, target.JoinedAt, now.Add(10*time.Minute))
		}
		event.InviteID = event.ID
	} else if input.InviteID != "" {
		status := "declined"
		if input.Kind == "accept-challenge" {
			status = "accepted"
		}
		_, err = tx.Exec(ctx, `UPDATE activity_invitations SET status=$2,resolved_event_id=$3 WHERE id=$1 AND status='pending'`, input.InviteID, status, event.ID)
	}
	if err != nil {
		return event, wallet, false, err
	}
	if cost > 0 {
		err = tx.QueryRow(ctx, `UPDATE activity_wallets SET balance=balance-$2 WHERE user_id=$1 AND balance>=$2 RETURNING balance`, userID, cost).Scan(&wallet.Balance)
		if errors.Is(err, pgx.ErrNoRows) {
			err = apiError("insufficient_credits")
		}
		if err != nil {
			return event, wallet, false, err
		}
		_, err = tx.Exec(ctx, `INSERT INTO activity_credit_ledger(user_id,kind,delta,event_id) VALUES($1,'drink',$2,$3)`, userID, -cost, event.ID)
	}
	return event, wallet, true, err
}

// Keep these statuses close to the service contract for integration callers.
var activityErrorStatuses = map[string]int{
	"activity_not_found": http.StatusNotFound, "activity_closed": http.StatusGone,
	"activity_membership_required": http.StatusForbidden, "activity_presence_required": http.StatusForbidden,
	"social_opt_in_required": http.StatusForbidden, "invitation_target_required": http.StatusForbidden,
	"activity_full": http.StatusConflict, "insufficient_credits": http.StatusConflict, "invitation_unavailable": http.StatusConflict,
}
