import { GANGS, MALLS_TO_WIN, PLAYER_GANGS, type PlayerGang } from '../game/data.ts';
import { AMBUSH_COST, AMBUSH_STRIKE } from '../game/rules.ts';

// Title screen: pick a gang (or continue a saved game) and read the rules.

export function startScreen(root: HTMLElement, canResume: boolean): Promise<PlayerGang | 'resume'> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'start';
    const difficulty: Record<PlayerGang, string> = { thorn: 'Rich neighbours', kopi: 'Quiet start', tide: 'River fortress', chrome: 'Hard: rivals on two sides' };
    el.innerHTML = `
      <div class="card">
        <h1>ORCHARD WARS</h1>
        <p class="sub">Singapore, after the collapse. Four gangs, one city, from Orchard Road to the river.</p>
        ${canResume ? '<button class="primary resume">Continue saved game</button>' : ''}
        <h2>Choose your gang</h2>
        <div class="gangs">
          ${PLAYER_GANGS.map((g) => `
            <button class="gang" data-g="${g}" style="--c:${GANGS[g].color}">
              <span class="gname">${GANGS[g].name}</span>
              <span class="corner">${GANGS[g].corner} · ${difficulty[g]}</span>
              <span class="blurb">${GANGS[g].blurb}</span>
            </button>`).join('')}
        </div>
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
    el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      if (btn.classList.contains('resume')) resolve('resume');
      else if (btn.dataset.g) resolve(btn.dataset.g as PlayerGang);
      else return;
      el.remove();
    });
  });
}
