import { GANGS, MALLS_TO_WIN, PLAYER_GANGS, suggestGangName } from '../game/data.ts';
import { AMBUSH_COST, AMBUSH_STRIKE } from '../game/rules.ts';
import { bindThemePicker, themePickerHtml } from './themePicker.ts';
import { lastRoom } from '../net/netSession.ts';

// Title screen: name your gang (a suggestion is filled in) or continue a saved game.
// Your corner of the city is drawn at random afterwards.

export type StartChoice =
  | { name: string }
  | 'resume'
  | { online: 'host'; name: string }
  | { online: 'join'; name: string; code: string };

/** Link to the rainy street walk (walk.html). The single-file build has no second page, so it skips it. */
function walkLink() {
  if ((globalThis as { __ORCHARD_MAP__?: unknown }).__ORCHARD_MAP__) return '';
  return '<a class="walk-link" href="./walk.html">Interlude: a rainy night walk down Orchard Road →</a>';
}

export function startScreen(root: HTMLElement, canResume: boolean, opts: { room?: string | null; error?: string } = {}): Promise<StartChoice> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'start';
    const corners = PLAYER_GANGS.map((g) => `<span style="color:${GANGS[g].color}">${GANGS[g].corner.split(' (')[0]}</span>`).join(', ');
    el.innerHTML = `
      <div class="card">
        <h1>ORCHARD WARS</h1>
        <p class="sub">Singapore, after the collapse. Four gangs, one city, from Orchard Road to the river.</p>
        ${canResume ? '<button class="primary resume" type="button">Continue saved game</button>' : ''}
        <form class="name-form">
          <label for="gang-name">Name your gang</label>
          <div class="name-row">
            <input id="gang-name" name="gang" maxlength="24" autocomplete="off" spellcheck="false" />
            <button type="button" class="reroll" title="Suggest another name">🎲</button>
          </div>
          <p class="note">You'll be dropped into one corner of the city at random: ${corners}.</p>
          <button class="primary go" type="submit">Claim your turf</button>
        </form>
        <h2 class="look-h">Play online with friends</h2>
        <div class="online">
          <button type="button" class="host-btn">Host a game</button>
          <div class="join-row">
            <input class="join-code" maxlength="8" placeholder="Room code" autocomplete="off" spellcheck="false" aria-label="Room code" />
            <button type="button" class="join-btn">Join</button>
          </div>
          ${lastRoom() ? `<button type="button" class="rejoin-btn" data-code="${lastRoom()}">Rejoin room ${lastRoom()}</button>` : ''}
        </div>
        <p class="note">Up to 4 players. Your gang name above is your name in the room. Empty corners are played by the computer.</p>
        <p class="note err" ${opts.error ? '' : 'hidden'}>${opts.error ?? ''}</p>
        <h2 class="look-h">Look</h2>
        ${themePickerHtml()}
        <details>
          <summary>How to play</summary>
          <ol>
            <li><b>Recruit.</b> Each turn you get new members: 3 (or one per 3 turfs), plus income from every
              <b>stronghold</b> (malls) you hold, plus a bonus for holding a whole region. Tap your turf to place them.</li>
            <li><b>Ambush.</b> While recruiting you can spend ${AMBUSH_COST} members to hide an ambush on a
              <b>street</b> turf you hold. The first rival to attack it loses ${AMBUSH_STRIKE} members before the fight.
              Nobody else can see it.</li>
            <li><b>Attack.</b> Pick your turf (2+ members) and a neighbouring turf. Attackers roll up to 3 dice, defenders 2,
              highest dice compared and ties go to the defender. <b>Strongholds roll 3 dice to defend.</b>
              Clear a turf and you take it: its buildings switch to your colour.</li>
            <li><b>Supply lines.</b> Turf that isn't connected through your territory to one of your strongholds is
              <b>cut off</b>: you can't recruit there, and it attacks with 2 dice at most. Cut rivals off to weaken them.</li>
            <li><b>Move.</b> Once per turn, move members between two of your turfs that are connected through your territory.</li>
            <li><b>Win</b> by holding ${MALLS_TO_WIN} strongholds at the start of your turn, or by wiping out every rival.
              The grey Civic Guard holds the centre: it never attacks, but it digs in.</li>
          </ol>
        </details>
        ${walkLink()}
        <p class="credit">Map data © OpenStreetMap contributors</p>
      </div>`;
    root.appendChild(el);
    const input = el.querySelector<HTMLInputElement>('#gang-name')!;
    bindThemePicker(el.querySelector('.themes')!.parentElement!, () => false);
    // Keep a typed name across the reload that a theme change causes.
    let kept = '';
    try {
      kept = sessionStorage.getItem('orchardwars-name') ?? '';
    } catch {
      /* storage blocked */
    }
    input.value = kept || suggestGangName();
    input.placeholder = input.value;
    input.addEventListener('input', () => {
      try {
        sessionStorage.setItem('orchardwars-name', input.value);
      } catch {
        /* storage blocked */
      }
    });
    el.querySelector('.reroll')!.addEventListener('click', () => {
      input.value = suggestGangName();
      input.focus();
    });
    el.querySelector('.resume')?.addEventListener('click', () => {
      el.remove();
      resolve('resume');
    });
    const nameNow = () => input.value.trim().replace(/\s+/g, ' ').slice(0, 24) || input.placeholder;
    el.querySelector('.host-btn')!.addEventListener('click', () => {
      el.remove();
      resolve({ online: 'host', name: nameNow() });
    });
    const join = (code: string) => {
      const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (c.length < 4) {
        const err = el.querySelector<HTMLElement>('.err')!;
        err.hidden = false;
        err.textContent = 'Type the room code the host gave you.';
        return;
      }
      el.remove();
      resolve({ online: 'join', name: nameNow(), code: c });
    };
    if (opts.room) {
      const box = el.querySelector<HTMLInputElement>('.join-code')!;
      box.value = opts.room;
      el.querySelector('.online')!.scrollIntoView({ block: 'center' });
    }
    el.querySelector('.join-btn')!.addEventListener('click', () => join(el.querySelector<HTMLInputElement>('.join-code')!.value));
    el.querySelector('.join-code')!.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') join((e.target as HTMLInputElement).value);
    });
    el.querySelector<HTMLElement>('.rejoin-btn')?.addEventListener('click', (e) => join((e.currentTarget as HTMLElement).dataset.code!));
    el.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = input.value.trim().replace(/\s+/g, ' ').slice(0, 24) || input.placeholder;
      el.remove();
      resolve({ name });
    });
  });
}
