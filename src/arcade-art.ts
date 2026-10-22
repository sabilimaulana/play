// Pocket Arcade illustrations. All SVG is authored here; no user content is interpolated.
const color = (name: string) => `var(--color-${name})`;
const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${color(fill)}"/>`;
const circle = (x: number, y: number, r: number, fill: string, stroke = '', sw = 0) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color(fill)}" ${stroke ? `stroke="${color(stroke)}" stroke-width="${sw}"` : ''}/>`;
const path = (points: string, fill: string) => `<path d="${points}" fill="${color(fill)}"/>`;
const svg = (w: number, h: number, body: string, label: string, klass = '') => `<svg class="${klass}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const mark = (x: number, y: number, kind: string, size = 32) => kind === 'X' ? `<g transform="translate(${x} ${y}) scale(${size/32})">${path('M0 6L6 0 16 10 26 0 32 6 22 16 32 26 26 32 16 22 6 32 0 26 10 16Z','red')}</g>` : `<circle cx="${x+size/2}" cy="${y+size/2}" r="${size*.36}" fill="none" stroke="${color('blue')}" stroke-width="${size*.23}"/>`;
export const arcadeBot = (c='purple') => svg(32,32,rect(7,5,18,19,c)+rect(4,10,24,11,c)+rect(10,11,12,8,'dark')+rect(12,13,3,3,'white')+rect(18,13,3,3,'white')+rect(9,25,5,4,c)+rect(19,25,5,4,c)+rect(14,1,4,4,c),'Pixel player avatar','bot');
export function arcadeScene() {
  let b = path('M35 126L270 24 570 140 340 282Z','purple-deep') + path('M35 126L35 245 340 385 340 282Z','panel') + path('M340 282L570 140 570 256 340 385Z','well');
  b += path('M35 245L270 128 570 256 340 385Z','purple-deep');
  for(let i=0;i<9;i++) b += `<path d="M${35+i*28} ${245-i*14}l305 140M${35+i*38} ${245+i*17}l235 -117" fill="none" stroke="${color('purple')}" stroke-opacity=".22" stroke-width="1"/>`;
  b += path('M35 126L270 24 270 128 35 245Z','panel') + path('M270 24L570 140 570 256 270 128Z','well');
  b += `<path d="M44 137L264 41M281 40L558 148" stroke="${color('purple')}" stroke-width="5"/>`;
  b += `<g transform="translate(100 101) skewY(-25)">${rect(0,0,122,36,'purple')}${rect(4,4,114,28,'well')}<text x="61" y="26" text-anchor="middle" fill="${color('green')}" font-family="var(--font-display)" font-size="31">PLAY CLUB</text></g>`;
  const cabinet = (x: number, y: number, c: string, icon: string)=>`<g transform="translate(${x} ${y})">${path('M0 0L47 -22 73 -10 26 12Z',c)}${path('M0 0L26 12 26 112 0 100Z','purple-deep')}${path('M26 12L73 -10 73 90 26 112Z',c)}${path('M31 18L68 0 68 42 31 60Z','dark')}${path('M35 22L64 8 64 35 35 49Z','well')}${path('M26 67L73 45 81 57 34 79Z','purple')}${path('M34 79L81 57 81 66 34 88Z','dark')}${circle(50,67,3,'red')}${circle(62,61,2,'yellow')}${path('M45 88L63 80 63 91 45 100Z','dark')}<text x="49" y="37" text-anchor="middle" fill="${color('white')}" font-family="var(--font-display)" font-size="27" transform="rotate(-25 49 37)">${icon}</text></g>`;
  b += cabinet(103,147,'green','×')+cabinet(188,108,'purple','♠')+cabinet(309,128,'pink','9');
  b += `<g transform="translate(432 206)">${rect(0,0,45,9,'yellow')}${rect(5,9,35,49,'red')}${rect(9,15,27,27,'dark')}${rect(13,20,7,15,'yellow')}${rect(24,20,7,15,'green')}${rect(10,59,8,16,'dark')}${rect(32,59,8,16,'dark')}</g>`;
  b += `<g transform="translate(228 247) scale(1.6)">${rect(3,0,20,19,'yellow')}${rect(0,6,26,11,'yellow')}${rect(7,6,13,7,'dark')}${rect(8,7,3,3,'white')}${rect(16,7,3,3,'white')}${rect(6,20,17,15,'purple')}${rect(3,35,7,6,'dark')}${rect(18,35,7,6,'dark')}</g>`;
  b += `<g transform="translate(371 291)">${rect(2,0,22,20,'green')}${rect(6,7,14,7,'dark')}${rect(8,8,3,3,'white')}${rect(16,8,3,3,'white')}${rect(5,21,18,16,'pink')}${rect(3,37,8,5,'dark')}${rect(18,37,8,5,'dark')}</g>`;
  b += `<g transform="translate(67 212)">${rect(2,22,29,30,'purple')}${rect(0,18,33,7,'purple-deep')}${rect(14,0,4,20,'green')}${path('M15 14L0 3 1 13 14 21M18 12L31 0 32 11 18 22','green')}</g>`;
  return svg(620,405,b,'An isometric pixel arcade with three cabinets, two friends, a vending machine, and a plant','arcade-scene');
}
export function gameCover(type: string) {
  let b=''; const soft = false; const r = soft ? 10 : 0;
  if(type==='tictactoe') {
    b += `<g transform="translate(77 24) rotate(${soft ? '-10' : '0'} 80 80)">${rect(4,10,164,164,'shadow',r)}${rect(0,0,164,164,soft?'purple':'purple-deep',r)}`;
    for(let i=0;i<9;i++) { const x=8+(i%3)*51,y=8+Math.floor(i/3)*51;b+=rect(x,y,46,46,soft?'white':'well',soft?6:0);if([0,4,8].includes(i))b+=mark(x+9,y+9,'X',28);if([2,3].includes(i))b+=mark(x+9,y+9,'O',28); }
    b+='</g>';
    if(soft) b+=mark(260,34,'O',44)+mark(28,131,'X',35);
  } else if(type==='poker') {
    b+=`<g transform="translate(85 30) rotate(-17 55 80)">${rect(3,6,94,139,'shadow',r)}${rect(0,0,94,139,'white',r)}<text x="14" y="34" fill="${color('dark')}" font-size="27" font-family="var(--font-body)" font-weight="800">A</text><text x="45" y="99" text-anchor="middle" fill="${color('dark')}" font-size="64">♠</text></g>`;
    b+=`<g transform="translate(156 38) rotate(12 45 70)">${rect(3,6,94,139,'shadow',r)}${rect(0,0,94,139,'white',r)}<text x="14" y="34" fill="${color('red')}" font-size="27" font-family="var(--font-body)" font-weight="800">K</text><text x="46" y="99" text-anchor="middle" fill="${color('red')}" font-size="59">♥</text></g>`;
    b+=circle(264,162,25,'purple','white',4)+circle(264,162,16,'purple','white',2);
  } else if(type==='checkers') {
    b+=`<g transform="translate(70 26) rotate(${soft ? '-12' : '0'} 100 80)">${rect(0,7,192,160,'shadow',r)}`;
    for(let y=0;y<4;y++)for(let x=0;x<5;x++)b+=rect(x*38,y*38,38,38,(x+y)%2?'purple-deep':'pink');
    for(const [x,y,c] of [[1,0,'white'],[3,0,'white'],[0,1,'white'],[2,3,'red'],[4,3,'red'],[3,2,'red']] as const)b+=circle(x*38+19,y*38+23,14,'dark')+circle(x*38+19,y*38+18,14,c)+circle(x*38+19,y*38+18,9,c,'purple-deep',2);
    b+='</g>';
  } else if(type==='sudoku') {
    b+=`<g transform="translate(84 22) rotate(${soft ? '9' : '0'} 80 80)">${rect(5,7,158,167,'shadow',r)}${rect(0,0,158,167,soft?'white':'purple-deep',r)}`;
    for(let i=0;i<16;i++){let x=8+i%4*37,y=9+Math.floor(i/4)*37;b+=rect(x,y,33,33,i===9?'yellow':soft?'paper':'well',soft?3:0);if(![2,5,9,14].includes(i))b+=`<text x="${x+16}" y="${y+26}" fill="${color(soft?'dark':'white')}" text-anchor="middle" font-family="var(--font-display)" font-size="27">${[5,3,0,7,6,0,1,9,8,0,2,4,3,6,0,8][i]}</text>`;} b+='</g>';
  } else if(type==='ceki') {
    const card = (x: number, y: number, deg: number, ink: string, rank: string, pip: string) => `<g transform="translate(${x} ${y}) rotate(${deg} 40 60)">${rect(3,6,80,120,'shadow',r)}${rect(0,0,80,120,'white',r)}<text x="11" y="29" fill="${color(ink)}" font-size="24" font-family="var(--font-body)" font-weight="800">${rank}</text><text x="40" y="88" text-anchor="middle" fill="${color(ink)}" font-size="50">${pip}</text></g>`;
    b+=card(62,42,-20,'red','7','♥')+card(130,30,0,'red','8','♥')+card(198,42,20,'dark','★','★');
  } else {
    b+=circle(147,116,66,'shadow')+circle(147,105,66,'red')+circle(228,63,33,'blue')+circle(272,160,23,'green');
    b+=circle(126,83,10,'white')+circle(163,83,10,'white')+circle(129,85,4,'dark')+circle(166,85,4,'dark');
    b+=`<path d="M130 119Q146 134 164 117" fill="none" stroke="${color('dark')}" stroke-width="5" stroke-linecap="round"/>`;
    for(const [x,y,c]of [[46,43,'purple'],[64,169,'yellow'],[272,103,'pink'],[205,183,'yellow'],[185,19,'green']] as const)b+=circle(x,y,5,c);
  }
  return svg(340,215,b,`${type === 'circccle' ? 'Circccle characters' : type+' game pieces'} illustration`,'game-art');
}
