# Online multiplayer

Orchard Wars plays online with up to 4 friends. Empty corners are played by the computer.

## How it works

It follows the merchant game's (Monsoon Merchants) multiplayer design, with Firebase in place of
PeerJS as the messenger:

- **The host's browser is the referee.** It keeps the real game, applies every move with the same
  rules engine (`src/game/rules.ts`), plays the computer gangs and any player who drops out, and
  publishes the result.
- **Players send their moves as intents** (place, ambush, attack, move, undo, end turn). The host
  checks each one against the rules and the turn order before applying it, so a player can only move
  their own gang on their own turn.
- **Moves feel instant for everyone.** A player's browser applies their own move straight away,
  without waiting for the host. The rules are deterministic, with the dice seeded in the game
  state, so it gets exactly the result the host will publish. The host still repeats and checks the
  move; the published log tags each result with the move that caused it, so players skip results
  they've already seen. If the two ever disagree (say the turn timer ran out first), the host's game
  wins and the player's board corrects itself. The host also answers players' moves at once rather
  than batching them.
- **One Firestore document per room** in the `orchardwars` collection; its id is the 5-letter room code.
  The host writes the game state, an event log (so everyone sees the dice and battles play out), the
  seats and the settings. Each player writes only their own fields: `joins.<id>`, `intents.<id>` and a
  heartbeat in `beats.<id>`. These field updates never overwrite each other.
- **Seats survive refreshes.** Each browser has a private player id (kept in local storage), so
  reopening the page and pressing **Rejoin room** puts you back in your seat. The host gets the
  referee role back the same way.
- **The game outlives the host's tab.** Unlike the merchant game's peer-to-peer room, the game lives
  in Firestore. If the host goes quiet for about 40 seconds, the other players are offered
  **Take over as host**, and the game carries on from where it was.
- **Dropping out:** depending on the room setting, the computer plays for a missing player, or
  everyone waits. With a turn timer, the computer finishes a turn when the timer runs out.
- **Late joiners** take over a computer-run gang that's still in the game (or watch if none is left).

Code: `src/net/store.ts` (Firestore and the local test store), `src/net/netSession.ts` (host and
player logic), `src/ui/lobby.ts` (the room screen). The game UI talks to the `GameSession`
interface in `src/game/session.ts`, which single-player and online sessions both implement.

## Firebase setup (one time)

The game uses the Firebase project `cpf-induction-escape-room` (shared with the induction escape
room). Firestore only accepts writes that its **security rules** allow. **This was set up on
23 Nov 2026** and checked with a real two-player game. The block below is kept for reference, e.g. if
the rules are ever reset. Without it, online play shows "The online server refused the connection".

In the [Firebase console](https://console.firebase.google.com/) → project **cpf-induction-escape-room** →
**Firestore Database** → **Rules**, add this block **inside** the existing
`match /databases/{database}/documents { … }` block, next to the escape room's rules (don't remove
those), then press **Publish**:

```
    // Orchard Wars online rooms: one document per room, id = the 5-letter room code.
    match /orchardwars/{room} {
      allow read: if true;
      allow create: if room.matches('^[A-Z0-9]{5}$')
                    && request.resource.data.game == 'orchardwars';
      allow update: if resource.data.game == 'orchardwars'
                    && request.resource.data.game == 'orchardwars';
      allow delete: if false;
    }
```

## Cleaning up old rooms

Rooms are small (5–20 KB), and leftovers cost next to nothing: nothing breaks and nothing slows
down if they stay. They do clutter the console, and abandoned games stay rejoinable. Every room
carries an `expiresAt` date for automatic cleanup:

| Room | Deleted after | Why |
| --- | --- | --- |
| Still in play or abandoned | 16 days without any activity (14 + 2 days' buffer) | Every write, including the heartbeat every 10 s while someone has it open, pushes the date forward, so a game in use is never deleted |
| Finished | 3 days after the game ends (1 + 2 days' buffer) | Heartbeats stop when the game ends, so the date stops moving |

The numbers live in `ROOM_TTL_DAYS` and `FINISHED_TTL_DAYS` in `src/net/store.ts`.

To turn deletion on (one time): Firebase console → **Firestore Database** → **TTL** → **Create
policy**, collection group `orchardwars`, timestamp field `expiresAt`. Firestore then deletes each room
some time after its date passes (usually within a day). Rooms created before 23 Nov 2026 have no
`expiresAt` and are never deleted automatically; remove those by hand if you like.

## Fair play

This is built for friendly games. The whole game state sits in a document every player's browser
can read, so someone determined could open the browser's developer tools and see other gangs'
hidden ambushes or predict the dice. Only the host's browser can apply moves, and it checks them
against the rules, so nobody can make illegal moves.

## Testing locally without Firebase

Add `?net=local&profile=a` to the URL in one tab and `?net=local&profile=b` in another tab of the
same browser. The tabs then talk through the browser's local storage instead of Firestore, and each
profile acts as a separate player. Host in one tab, join with the room code in the other.
