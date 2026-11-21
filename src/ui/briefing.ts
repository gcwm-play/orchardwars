import { GANGS, REGIONS, TERRITORIES, type PlayerGang } from '../game/data.ts';
import { recruitsFor, territoriesOf, type GameState } from '../game/rules.ts';
import { defenceDice } from '../game/odds.ts';

// The briefing shown after your corner is drawn: where you are, what you hold, what it pays,
// and what's next door.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function briefing(root: HTMLElement, s: GameState, me: PlayerGang): Promise<void> {
  return new Promise((resolve) => {
    const gang = GANGS[me];
    const name = s.names?.[me] ?? gang.name;
    const mine = territoriesOf(s, me);
    const r = recruitsFor(s, me);
    const region = REGIONS.find((x) => x.id === TERRITORIES[mine[0]].region)!;

    // Everything bordering the corner, split into strongholds to aim for and rival gangs.
    const next = [...new Set(mine.flatMap((t) => s.adjacency[t]))].filter((t) => !mine.includes(t));
    const targets = next.filter((t) => TERRITORIES[t].kind === 'mall');
    const rivals = [...new Set(next.map((t) => s.owner[t]).filter((g) => g !== 'neutral' && g !== me))];

    const turfRows = mine
      .map((t) => {
        const d = TERRITORIES[t];
        const mall = d.kind === 'mall';
        return `<li><span class="kind ${d.kind}"></span><b>${esc(d.name)}</b> · ${s.members[t]} members
          <span class="muted">${esc(d.real)}</span>
          ${mall ? `<span class="inc">+${d.income}/turn</span> <span class="muted">defends with ${defenceDice(s.members[t], true)} dice</span>`
            : `<span class="muted">street: you can hide ambushes here</span>`}</li>`;
      })
      .join('');
    const targetRows = targets
      .map((t) => `<li><span class="kind mall"></span><b>${esc(TERRITORIES[t].name)}</b> <span class="inc">+${TERRITORIES[t].income}/turn</span>
        <span class="muted">held by ${esc(s.names?.[s.owner[t]] ?? GANGS[s.owner[t]].name)}, ${s.members[t]} defending</span></li>`)
      .join('');

    const el = document.createElement('div');
    el.className = 'start briefing';
    el.innerHTML = `
      <div class="card" style="--c:${gang.color}">
        <div class="eyebrow">Your turf has been drawn</div>
        <h1 style="color:${gang.color}">${esc(name)}</h1>
        <p class="sub">You start in <b>${esc(gang.corner)}</b>. Your colour is <span class="swatch"></span>. Every building you take turns this colour.</p>
        <p class="perk">${esc(gang.perk)}</p>
        <div class="cols">
          <section>
            <h2>What you hold</h2>
            <ul>${turfRows}</ul>
          </section>
          <section>
            <h2>Your income</h2>
            <ul class="income">
              <li><span>Base</span><b>+${r.base} / turn</b></li>
              ${r.malls.map((m) => `<li><span>◆ ${esc(TERRITORIES[m.t].name)}</span><b>+${m.n} / turn</b></li>`).join('')}
              ${r.regions.map((g) => `<li><span>All of ${esc(REGIONS.find((x) => x.id === g.region)!.name)}</span><b>+${g.n} / turn</b></li>`).join('')}
              ${r.firstTurn ? `<li><span>Opening bonus (first turn only)</span><b>+${r.firstTurn}</b></li>` : ''}
              <li class="total"><span>Your first turn</span><b>${r.total} members</b></li>
            </ul>
            <p class="muted small">Holding all of ${esc(region.name)} pays +${region.bonus} a turn. Lose one turf and the bonus goes.</p>
          </section>
        </div>
        <section>
          <h2>Next door</h2>
          ${targetRows ? `<ul>${targetRows}</ul>` : '<p class="muted">No strongholds border you yet: take a street first to reach one.</p>'}
          <p class="muted small">${rivals.length
            ? `Rival gangs on your border: ${rivals.map((g) => `<b style="color:${GANGS[g].color}">${esc(s.names?.[g] ?? GANGS[g].name)}</b>`).join(', ')}.`
            : 'No rival gang borders you yet. Only the Civic Guard stands in your way.'}</p>
        </section>
        <div class="go-bar"><button class="primary go" type="button">Let's go</button></div>
      </div>`;
    root.appendChild(el);
    el.querySelector('.go')!.addEventListener('click', () => {
      el.remove();
      resolve();
    });
  });
}
