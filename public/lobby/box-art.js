// Per-game illustrated box-lid art — inline SVG strings.
// Pure, side-effect-free string builders so they can be unit-tested without
// pulling in lobby.js's on-load main(). Each takes a `variant` for words;
// others ignore it. Every real illustration is drawn on the shared 420×120 lid
// canvas; unknown games fall back to a blank beige rectangle.

export function boxArtWords(variant) {
  const accent = variant === 'scrabble' ? '#cf3a2c' : '#d97757';
  const accent2 = variant === 'scrabble' ? '#3a6db0' : '#c2a14e';
  const tiles = [['W',4],['O',1],['R',1],['D',2],['S',1]];
  const tileSvgs = tiles.map(([ch, val], i) => `
    <g transform="translate(${i*30}, 0)">
      <rect x="0" y="0" width="26" height="30" rx="2.5" fill="#fff8e3" stroke="#9a7e3a" stroke-width="0.8"/>
      <rect x="0" y="0" width="26" height="3" fill="#000" opacity="0.06"/>
      <text x="13" y="19" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="15" fill="#3a2a18">${ch}</text>
      <text x="21" y="26" text-anchor="middle" font-family="Georgia, serif" font-weight="600" font-size="6" fill="#3a2a18">${val}</text>
    </g>`).join('');
  let grid = '';
  for (let i = 0; i < 9; i++) grid += `<line x1="0" x2="420" y1="${i*15}" y2="${i*15}"/>`;
  for (let i = 0; i < 29; i++) grid += `<line y1="0" y2="120" x1="${i*15}" x2="${i*15}"/>`;
  return `
    <svg viewBox="0 0 420 120" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="aw-paper-${variant||'wwf'}" width="3" height="3" patternUnits="userSpaceOnUse">
          <rect width="3" height="3" fill="#f3ead3"/>
          <circle cx="1" cy="1" r="0.3" fill="#c9b88a" opacity="0.4"/>
        </pattern>
      </defs>
      <rect width="420" height="120" fill="url(#aw-paper-${variant||'wwf'})"/>
      <g stroke="#c9b88a" stroke-width="0.4" opacity="0.5">${grid}</g>
      <rect x="30" y="18" width="15" height="15" fill="${accent}" opacity="0.85"/>
      <rect x="375" y="87" width="15" height="15" fill="${accent2}" opacity="0.85"/>
      <rect x="105" y="75" width="15" height="15" fill="${accent}" opacity="0.7"/>
      <rect x="330" y="30" width="15" height="15" fill="${accent2}" opacity="0.7"/>
      <g transform="translate(135, 45)">${tileSvgs}</g>
    </svg>`;
}

export function boxArtRummikub() {
  const tiles = [
    {n:8, c:'#3a6db0'}, {n:9, c:'#3a6db0'}, {n:10, c:'#3a6db0'}, {n:11, c:'#3a6db0'}, {n:12, c:'#3a6db0'},
  ];
  const sevens = [{n:7,c:'#cf3a2c'},{n:7,c:'#3a6db0'},{n:7,c:'#1f6b3a'},{n:7,c:'#2a1808'}];
  const tileGroup = (arr) => arr.map((t,i) => `
    <g transform="translate(${i*24}, 0)">
      <rect x="0" y="0" width="22" height="32" rx="3" fill="#f7f0d8" stroke="#5a4a2a" stroke-width="0.6"/>
      <rect x="0" y="0" width="22" height="3" fill="#fff" opacity="0.5"/>
      <text x="11" y="24" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="18" fill="${t.c}">${t.n}</text>
    </g>`).join('');
  return `
    <svg viewBox="0 0 420 120" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="ar-felt" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="2" height="2" fill="#1d4f47"/>
          <circle cx="1" cy="1" r="0.3" fill="#2a6960" opacity="0.6"/>
        </pattern>
      </defs>
      <rect width="420" height="120" fill="url(#ar-felt)"/>
      <path d="M8 8 H40 M8 8 V36" stroke="#c9a14e" stroke-width="1.2" fill="none"/>
      <path d="M412 112 H380 M412 112 V84" stroke="#c9a14e" stroke-width="1.2" fill="none"/>
      <g transform="translate(50, 22)">${tileGroup(tiles)}</g>
      <g transform="translate(110, 70)">${tileGroup(sevens)}</g>
      <g transform="translate(360, 24) rotate(12)">
        <rect x="0" y="0" width="22" height="32" rx="3" fill="#f7f0d8" stroke="#5a4a2a" stroke-width="0.6"/>
        <text x="11" y="24" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="20" fill="#cf3a2c">★</text>
      </g>
      <g transform="translate(330, 76) rotate(-8)">
        <rect x="0" y="0" width="22" height="32" rx="3" fill="#f7f0d8" stroke="#5a4a2a" stroke-width="0.6"/>
        <text x="11" y="24" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="18" fill="#1f6b3a">13</text>
      </g>
    </svg>`;
}

export function boxArtBackgammon() {
  let pts = '';
  for (let i = 0; i < 6; i++) {
    const x = 28 + i*26;
    const c1 = i%2 ? '#3a1f12' : '#fff5d8';
    const c2 = i%2 ? '#fff5d8' : '#3a1f12';
    pts += `<path d="M${x},17 L${x+22},17 L${x+11},58 Z" fill="${c1}"/>`;
    pts += `<path d="M${x},103 L${x+22},103 L${x+11},62 Z" fill="${c2}"/>`;
  }
  for (let i = 0; i < 6; i++) {
    const x = 230 + i*26;
    const c1 = i%2 ? '#fff5d8' : '#3a1f12';
    const c2 = i%2 ? '#3a1f12' : '#fff5d8';
    pts += `<path d="M${x},17 L${x+22},17 L${x+11},58 Z" fill="${c1}"/>`;
    pts += `<path d="M${x},103 L${x+22},103 L${x+11},62 Z" fill="${c2}"/>`;
  }
  return `
    <svg viewBox="0 0 420 120" preserveAspectRatio="xMidYMid slice">
      <rect width="420" height="120" fill="#7a3a28"/>
      <rect x="15" y="15" width="390" height="90" fill="#c9a872" stroke="#3a1f12" stroke-width="1.2"/>
      ${pts}
      <rect x="206" y="15" width="8" height="90" fill="#3a1f12"/>
      <circle cx="39" cy="96" r="7" fill="#f7e7c2" stroke="#5a3a18" stroke-width="0.6"/>
      <circle cx="39" cy="83" r="7" fill="#f7e7c2" stroke="#5a3a18" stroke-width="0.6"/>
      <circle cx="39" cy="70" r="7" fill="#f7e7c2" stroke="#5a3a18" stroke-width="0.6"/>
      <circle cx="377" cy="24" r="7" fill="#3a1f12" stroke="#1a0a04" stroke-width="0.6"/>
      <circle cx="377" cy="37" r="7" fill="#3a1f12" stroke="#1a0a04" stroke-width="0.6"/>
      <g transform="translate(310, 50) rotate(-8)">
        <rect x="0" y="0" width="26" height="26" rx="3.5" fill="#fff8e3" stroke="#3a1f12" stroke-width="0.8"/>
        <circle cx="7" cy="7"  r="1.7" fill="#3a1f12"/>
        <circle cx="19" cy="19" r="1.7" fill="#3a1f12"/>
        <circle cx="13" cy="13" r="1.7" fill="#3a1f12"/>
      </g>
      <g transform="translate(342, 66) rotate(15)">
        <rect x="0" y="0" width="26" height="26" rx="3.5" fill="#fff8e3" stroke="#3a1f12" stroke-width="0.8"/>
        <circle cx="7" cy="7"  r="1.7" fill="#cf3a2c"/>
        <circle cx="19" cy="7" r="1.7" fill="#cf3a2c"/>
        <circle cx="7" cy="19" r="1.7" fill="#cf3a2c"/>
        <circle cx="19" cy="19" r="1.7" fill="#cf3a2c"/>
      </g>
    </svg>`;
}

export function boxArtBuraco() {
  // A fan of three cards on green felt with a joker peeking out.
  // suit pip = ♥ (red), card values 5-6-7 of hearts, plus a jester face cap.
  return `
    <svg viewBox="0 0 420 120" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="bu-felt" width="3" height="3" patternUnits="userSpaceOnUse">
          <rect width="3" height="3" fill="#275e3a"/>
          <circle cx="1.5" cy="1.5" r="0.4" fill="#1c4329" opacity="0.7"/>
        </pattern>
      </defs>
      <rect width="420" height="120" fill="url(#bu-felt)"/>
      <!-- gold corner flourishes echoing rummikub -->
      <path d="M8 8 H40 M8 8 V36" stroke="#d8b75a" stroke-width="1.2" fill="none"/>
      <path d="M412 112 H380 M412 112 V84" stroke="#d8b75a" stroke-width="1.2" fill="none"/>

      <!-- Card fan, centered around (210, 64), each card 56x80, rotated -->
      <g transform="translate(150, 28) rotate(-14 28 40)">
        <rect x="0" y="0" width="56" height="80" rx="4" fill="#fff" stroke="#222" stroke-width="0.7"/>
        <text x="6" y="16" font-family="Georgia, serif" font-size="14" font-weight="700" fill="#cf3a2c">5</text>
        <text x="6" y="28" font-size="10" fill="#cf3a2c">♥</text>
        <text x="28" y="50" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="#cf3a2c">♥</text>
      </g>
      <g transform="translate(186, 22)">
        <rect x="0" y="0" width="56" height="80" rx="4" fill="#fff" stroke="#222" stroke-width="0.7"/>
        <text x="6" y="16" font-family="Georgia, serif" font-size="14" font-weight="700" fill="#cf3a2c">6</text>
        <text x="6" y="28" font-size="10" fill="#cf3a2c">♥</text>
        <text x="28" y="50" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="#cf3a2c">♥</text>
      </g>
      <g transform="translate(222, 28) rotate(14 28 40)">
        <rect x="0" y="0" width="56" height="80" rx="4" fill="#fff" stroke="#222" stroke-width="0.7"/>
        <text x="6" y="16" font-family="Georgia, serif" font-size="14" font-weight="700" fill="#cf3a2c">7</text>
        <text x="6" y="28" font-size="10" fill="#cf3a2c">♥</text>
        <text x="28" y="50" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="#cf3a2c">♥</text>
      </g>

      <!-- Joker card peeking from the right -->
      <g transform="translate(312, 30) rotate(22 28 40)">
        <rect x="0" y="0" width="56" height="80" rx="4" fill="#fff8e3" stroke="#222" stroke-width="0.7"/>
        <!-- jester hat: three points with bell-tip dots -->
        <path d="M14 38 L20 18 L28 30 L36 18 L42 38 Z" fill="#cf3a2c" stroke="#1a0a04" stroke-width="0.6"/>
        <circle cx="20" cy="18" r="1.6" fill="#d8b75a"/>
        <circle cx="36" cy="18" r="1.6" fill="#d8b75a"/>
        <!-- face -->
        <circle cx="28" cy="46" r="9" fill="#f7e7c2" stroke="#5a3a18" stroke-width="0.5"/>
        <circle cx="25" cy="44" r="0.9" fill="#1a0a04"/>
        <circle cx="31" cy="44" r="0.9" fill="#1a0a04"/>
        <path d="M24 49 Q28 52 32 49" stroke="#1a0a04" stroke-width="0.9" fill="none" stroke-linecap="round"/>
        <text x="6" y="14" font-family="Georgia, serif" font-size="9" font-weight="700" fill="#cf3a2c">JK</text>
        <text x="50" y="76" text-anchor="end" font-family="Georgia, serif" font-size="9" font-weight="700" fill="#cf3a2c">JK</text>
      </g>
    </svg>`;
}

export function boxArtRisk() {
  // Antique conquest map: parchment "sea" with a faint graticule, three inked
  // landmasses in contested colors, dashed sea routes between them, army discs,
  // and a crossed-swords accent. Echoes the risk antique-map board re-theme.
  const graticule = (() => {
    let g = '';
    for (let i = 1; i < 8; i++) g += `<line x1="0" x2="420" y1="${i*15}" y2="${i*15}"/>`;
    for (let i = 1; i < 28; i++) g += `<line y1="0" y2="120" x1="${i*15}" x2="${i*15}"/>`;
    return g;
  })();
  const army = (x, y, c, n) => `
    <circle cx="${x}" cy="${y}" r="9" fill="${c}" stroke="#2a1808" stroke-width="1"/>
    <text x="${x}" y="${y+4}" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="11" fill="#fff5e8">${n}</text>`;
  return `
    <svg viewBox="0 0 420 120" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="rk-sea" cx="50%" cy="42%" r="80%">
          <stop offset="0%" stop-color="#dcc796"/>
          <stop offset="100%" stop-color="#b59a64"/>
        </radialGradient>
      </defs>
      <rect width="420" height="120" fill="url(#rk-sea)"/>
      <g stroke="#8a6a36" stroke-width="0.4" opacity="0.35">${graticule}</g>

      <!-- dashed sea routes -->
      <g stroke="#5a3a18" stroke-width="1.4" stroke-dasharray="4 5" fill="none" opacity="0.7">
        <path d="M96 52 Q200 14 304 46"/>
        <path d="M110 70 Q210 104 300 74"/>
      </g>

      <!-- contested landmasses -->
      <path d="M40 30 Q70 18 110 30 Q140 40 120 70 Q96 92 60 82 Q26 70 32 50 Z"
            fill="#b8332a" stroke="#5a1408" stroke-width="2" opacity="0.92"/>
      <path d="M286 30 Q330 20 372 36 Q392 56 376 80 Q344 98 308 84 Q278 70 286 46 Z"
            fill="#2c647f" stroke="#163448" stroke-width="2" opacity="0.92"/>
      <path d="M176 64 Q214 52 250 66 Q262 86 238 100 Q204 110 184 94 Q166 80 176 64 Z"
            fill="#3e9a5c" stroke="#1a5a30" stroke-width="2" opacity="0.92"/>

      ${army(78, 52, '#6a1408', 4)}
      ${army(334, 56, '#163448', 3)}
      ${army(214, 80, '#1a5a30', 2)}

      <!-- crossed swords accent -->
      <g transform="translate(372, 18) rotate(45)" stroke="#3a2a18" stroke-width="2" stroke-linecap="round">
        <line x1="-14" y1="0" x2="14" y2="0" stroke="#d8d2c4" stroke-width="3"/>
        <line x1="-14" y1="0" x2="-18" y2="0" stroke="#8a6a36" stroke-width="5"/>
      </g>
      <g transform="translate(372, 18) rotate(-45)" stroke="#3a2a18" stroke-width="2" stroke-linecap="round">
        <line x1="-14" y1="0" x2="14" y2="0" stroke="#d8d2c4" stroke-width="3"/>
        <line x1="-14" y1="0" x2="-18" y2="0" stroke="#8a6a36" stroke-width="5"/>
      </g>
    </svg>`;
}

export function boxArtCribbage() {
  // A varnished cribbage board (two rows of drilled peg holes) with two pegs in
  // the lead, beside a 5 + 10-of-spades "fifteen-two" pair on the rail.
  let holes = '';
  for (let i = 0; i < 22; i++) {
    const x = 30 + i*15;
    // grouped in fives with a small gap, like a real board
    const gx = x + Math.floor(i/5)*6;
    holes += `<circle cx="${gx}" cy="40" r="2.6" fill="#2a1808"/>`;
    holes += `<circle cx="${gx}" cy="54" r="2.6" fill="#2a1808"/>`;
  }
  const peg = (x, y, c) => `
    <circle cx="${x}" cy="${y}" r="3.4" fill="${c}" stroke="#1a0a04" stroke-width="0.7"/>
    <rect x="${x-1.4}" y="${y-12}" width="2.8" height="12" rx="1.4" fill="${c}" stroke="#1a0a04" stroke-width="0.5"/>`;
  return `
    <svg viewBox="0 0 420 120" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="cr-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#9a5a2c"/>
          <stop offset="50%" stop-color="#7a3a18"/>
          <stop offset="100%" stop-color="#5a2a10"/>
        </linearGradient>
      </defs>
      <rect width="420" height="120" fill="url(#cr-wood)"/>
      <!-- wood grain streaks -->
      <g stroke="#3a1c0a" stroke-width="0.6" opacity="0.35">
        <path d="M0 22 Q210 16 420 24" fill="none"/>
        <path d="M0 70 Q210 78 420 68" fill="none"/>
        <path d="M0 98 Q210 92 420 100" fill="none"/>
      </g>
      <!-- inset board panel -->
      <rect x="14" y="24" width="392" height="48" rx="6" fill="#8a4a22" stroke="#2a1808" stroke-width="1.5"/>
      ${holes}
      ${peg(45, 40, '#cf3a2c')}
      ${peg(60, 54, '#d8b75a')}

      <!-- fifteen-two cards on the rail below -->
      <g transform="translate(150, 78) rotate(-8 24 18)">
        <rect x="0" y="0" width="48" height="34" rx="4" fill="#fff" stroke="#222" stroke-width="0.7"/>
        <text x="5" y="14" font-family="Georgia, serif" font-size="13" font-weight="700" fill="#cf3a2c">5</text>
        <text x="24" y="26" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="#cf3a2c">♥</text>
      </g>
      <g transform="translate(196, 74) rotate(7 24 18)">
        <rect x="0" y="0" width="48" height="34" rx="4" fill="#fff" stroke="#222" stroke-width="0.7"/>
        <text x="5" y="14" font-family="Georgia, serif" font-size="13" font-weight="700" fill="#1a1208">10</text>
        <text x="24" y="26" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="#1a1208">♠</text>
      </g>
      <text x="300" y="98" font-family="Georgia, serif" font-style="italic" font-size="15" font-weight="700" fill="#f7e7c2" opacity="0.9">fifteen&#8211;two</text>
    </svg>`;
}

export function boxArtSorry() {
  // Two checker pawns (red home, blue chasing) on a stretch of the parchment
  // track, with a colored slide arrow and a "SORRY!" card — the slidy diagonal
  // chasing game. Palette matches the Cabinet board (Board4P).
  let cells = '';
  for (let i = 0; i < 9; i++) {
    cells += `<rect x="${24 + i*30}" y="44" width="26" height="26" rx="3" fill="#f7eccb" stroke="#1a1208" stroke-width="1.4"/>`;
  }
  const pawn = (x, y, mid, deep) => `
    <ellipse cx="${x}" cy="${y+9}" rx="11" ry="4" fill="#1a1208" opacity="0.25"/>
    <circle cx="${x}" cy="${y}" r="11" fill="${mid}" stroke="${deep}" stroke-width="2"/>
    <circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#fff5e8" stroke-width="1.4" opacity="0.8"/>`;
  return `
    <svg viewBox="0 0 420 120" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="sr-board" cx="50%" cy="40%" r="80%">
          <stop offset="0%" stop-color="#f7ebc8"/>
          <stop offset="100%" stop-color="#d8c590"/>
        </radialGradient>
      </defs>
      <rect width="420" height="120" fill="url(#sr-board)"/>
      ${cells}

      <!-- red slide arrow along the track -->
      <g stroke="#6a1408" fill="#6a1408">
        <line x1="118" y1="57" x2="196" y2="57" stroke="#b8332a" stroke-width="7" stroke-linecap="round"/>
        <circle cx="118" cy="57" r="7" fill="#b8332a" stroke="#6a1408" stroke-width="2"/>
        <polygon points="196,47 216,57 196,67" fill="#b8332a" stroke="#6a1408" stroke-width="2" stroke-linejoin="round"/>
      </g>

      ${pawn(54, 57, '#b8332a', '#6a1408')}
      ${pawn(248, 57, '#2c647f', '#163448')}

      <!-- SORRY! card tucked at the right -->
      <g transform="translate(322, 22) rotate(8 36 38)">
        <rect x="0" y="0" width="72" height="76" rx="6" fill="#fff5e8" stroke="#6a1408" stroke-width="2"/>
        <rect x="6" y="6" width="60" height="64" rx="4" fill="none" stroke="#b8332a" stroke-width="1.2" stroke-dasharray="3 3"/>
        <text x="36" y="46" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-weight="800" font-size="20" fill="#b8332a" transform="rotate(-4 36 42)">Sorry!</text>
      </g>
    </svg>`;
}

export function boxArtClue() {
  // Mansion mystery: a parchment floor-plan fragment (inked rooms with door
  // gaps) and a faint footprint trail leading to a brass-rimmed magnifying
  // glass that enlarges a room outline and a serif "?". Echoes the clue
  // mansion-parlour board theme (plum ink, brass, parchment).
  const room = (x, y, w, h) => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#c9b587" stroke="#40242e" stroke-width="2"/>`;
  const foot = (x, y, r) => `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="4.6" transform="rotate(${r} ${x} ${y})" fill="#40242e" opacity="0.42"/>`;
  return `
    <svg viewBox="0 0 420 120" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="cl-parch" cx="45%" cy="40%" r="85%">
          <stop offset="0%" stop-color="#e6d4a4"/>
          <stop offset="100%" stop-color="#c2a870"/>
        </radialGradient>
      </defs>
      <rect width="420" height="120" fill="url(#cl-parch)"/>

      <!-- floor-plan fragment: inked rooms with door gaps -->
      <g opacity="0.9">
        ${room(28, 24, 84, 48)}
        ${room(120, 20, 66, 40)}
        ${room(40, 80, 72, 28)}
        ${room(150, 66, 66, 44)}
        <line x1="112" y1="40" x2="112" y2="52" stroke="#e6d4a4" stroke-width="3"/>
        <line x1="150" y1="40" x2="162" y2="40" stroke="#e6d4a4" stroke-width="3"/>
        <line x1="76"  y1="80" x2="76"  y2="92" stroke="#e6d4a4" stroke-width="3"/>
      </g>

      <!-- footprint trail toward the lens -->
      <g>
        ${foot(122, 102, 18)}${foot(146, 98, 26)}${foot(170, 92, 20)}
        ${foot(196, 86, 30)}${foot(222, 80, 24)}
      </g>

      <!-- magnifying glass -->
      <g transform="translate(302, 54)">
        <line x1="26" y1="26" x2="62" y2="62" stroke="#7a5a2a" stroke-width="11" stroke-linecap="round"/>
        <line x1="26" y1="26" x2="62" y2="62" stroke="#c2a14e" stroke-width="5" stroke-linecap="round"/>
        <circle r="34" fill="#f4ecd8" opacity="0.55"/>
        <circle r="34" fill="#bcd0d8" opacity="0.22"/>
        <rect x="-22" y="-16" width="26" height="21" fill="none" stroke="#40242e" stroke-width="2"/>
        <text x="12" y="13" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="34" fill="#7a1f2e">?</text>
        <circle r="34" fill="none" stroke="#7a5a2a" stroke-width="9"/>
        <circle r="34" fill="none" stroke="#c2a14e" stroke-width="5"/>
        <path d="M -22 -14 A 30 30 0 0 1 6 -30" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.55" stroke-linecap="round"/>
      </g>
    </svg>`;
}

export function boxArt(gameType, variant) {
  if (gameType === 'words')      return boxArtWords(variant);
  if (gameType === 'rummikub')   return boxArtRummikub();
  if (gameType === 'backgammon') return boxArtBackgammon();
  if (gameType === 'buraco')     return boxArtBuraco();
  if (gameType === 'risk')       return boxArtRisk();
  if (gameType === 'cribbage')   return boxArtCribbage();
  if (gameType === 'sorry')      return boxArtSorry();
  if (gameType === 'clue')       return boxArtClue();
  return `<svg viewBox="0 0 200 120"><rect width="200" height="120" fill="#e9d9a8"/></svg>`;
}
