import { GANGS, MALLS_TO_WIN, PLAYER_GANGS, suggestGangName } from '../game/data.ts';
import { AMBUSH_COST, AMBUSH_STRIKE } from '../game/rules.ts';

// Title screen: name your gang (a suggestion is filled in) or continue a saved game.
// Your corner of the city is drawn at random afterwards.

export type StartChoice = { name: string } | 'resume';

export function startScreen(root: HTMLElement, canResume: boolean): Promise<StartChoice> {
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
            <li><b>Move.</b> Once per turn, move members between two of your turfs that are connected through your territory.</li>
            <li><b>Win</b> by holding ${MALLS_TO_WIN} strongholds at the start of your turn, or by wiping out every rival.
              The grey Civic Guard holds the centre: it never attacks, but it digs in.</li>
          </ol>
        </details>
        <p class="credit">Map data © OpenStreetMap contributors</p>
      </div>`;
    root.appendChild(el);
    const input = el.querySelector<HTMLInputElement>('#gang-name')!;
    input.value = suggestGangName();
    input.placeholder = input.value;
    el.querySelector('.reroll')!.addEventListener('click', () => {
      input.value = suggestGangName();
      input.focus();
    });
    el.querySelector('.resume')?.addEventListener('click', () => {
      el.remove();
      resolve('resume');
    });
    el.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = input.value.trim().replace(/\s+/g, ' ').slice(0, 24) || input.placeholder;
      el.remove();
      resolve({ name });
    });
  });
}
