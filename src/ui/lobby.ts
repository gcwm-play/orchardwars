import type { NetSession } from '../net/netSession.ts';

// The room screen before an online game starts: the code to share, who's in, the host's
// settings, and the Start button. Resolves once the game has started.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const TIMERS: [number, string][] = [[60, '1 min'], [120, '2 min'], [180, '3 min'], [300, '5 min'], [0, 'No timer']];

export function lobby(root: HTMLElement, net: NetSession): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'start lobby';
    root.appendChild(el);
    let last = '';
    const render = () => {
      if (net.started) {
        el.remove();
        resolve();
        return;
      }
      const host = net.role === 'host';
      const seats = net.lobbySeats;
      const set = net.lobbySettings;
      const html = `<div class="card">
        <div class="eyebrow">${host ? 'You are hosting' : 'Joined a room'}</div>
        <div class="codehead"><div><div class="label">Room code</div><div class="codebig">${esc(net.code)}</div></div>
          <button type="button" class="copy" data-act="copy">Copy invite link</button></div>
        <p class="muted">${host ? 'Send the code (or the link) to your friends. They open the game, choose <b>Join</b> and type it in.' : 'Waiting for the host to start the game…'}</p>
        ${net.status ? `<p class="warn">${esc(net.status)}</p>` : ''}
        <h2>Players (${seats.length}/4)</h2>
        <div class="seats">${seats
          .map((s) => `<div class="seat"><b>${esc(s.name)}</b>${s.host ? ' <span class="muted">· host</span>' : ''}${s.me ? ' <span class="muted">· you</span>' : ''}
            <span class="chip-s ${s.connected ? 'ok' : 'off'}">${s.connected ? 'Here' : 'Offline'}</span></div>`)
          .join('')}</div>
        ${seats.length > 4 ? '<p class="muted">Only the first 4 get a gang; the rest can watch.</p>' : ''}
        <h2>Settings</h2>
        <div class="settings">
          <label>Turn timer <select data-field="timer" ${host ? '' : 'disabled'}>${TIMERS.map(([v, l]) => `<option value="${v}" ${set.timer === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>If a player drops out <select data-field="drop" ${host ? '' : 'disabled'}>
            <option value="ai" ${set.drop === 'ai' ? 'selected' : ''}>The computer plays for them</option>
            <option value="wait" ${set.drop === 'wait' ? 'selected' : ''}>Wait for them</option></select></label>
        </div>
        <p class="muted small">Corners are drawn at random when the game starts. Empty corners go to the computer. When the turn timer runs out, the computer finishes that turn.</p>
        <div class="lobby-foot"><button type="button" data-act="leave">Leave</button>
          ${host ? `<button type="button" class="primary" data-act="start">Start game · ${Math.min(4, seats.length)} ${Math.min(4, seats.length) === 1 ? 'player' : 'players'}, ${4 - Math.min(4, seats.length)} computer</button>` : ''}</div>
      </div>`;
      if (html !== last) {
        last = html;
        el.innerHTML = html;
      }
    };
    el.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-act]');
      if (!b) return;
      if (b.dataset.act === 'start') net.start();
      if (b.dataset.act === 'leave') net.leave();
      if (b.dataset.act === 'copy') {
        const url = new URL(location.href);
        url.search = '';
        url.searchParams.set('room', net.code);
        for (const k of ['net', 'profile', 'theme']) {
          const v = new URLSearchParams(location.search).get(k);
          if (v) url.searchParams.set(k, v);
        }
        try {
          await navigator.clipboard.writeText(url.toString());
          b.textContent = 'Copied!';
        } catch {
          b.textContent = url.toString();
        }
      }
    });
    el.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.dataset.field === 'timer') net.setSettings({ timer: Number(t.value) });
      if (t.dataset.field === 'drop') net.setSettings({ drop: t.value as 'ai' | 'wait' });
    });
    net.onLobby(render);
    render();
  });
}
