import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const COLORS = ['#ff3f81', '#22e7ff', '#b6ff35'];
const server = http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ ok: true, service: 'black-castle-coop', rooms: rooms.size }));
});
const wss = new WebSocketServer({ server });
const newCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

function fresh(code, hostId) {
  return { code, hostId, phase: 'waiting', elapsed: 0, coins: 0, bossHp: 100, result: null, players: [], arrows: [], shots: [], fireballs: [], pickups: [], spawn: 0, fireSpawn: 5, coinSpawn: 3, hurt: 0, netClock: 0, last: Date.now() };
}
function pub(room) {
  return { code: room.code, hostId: room.hostId, phase: room.phase, elapsed: room.elapsed, coins: room.coins, bossHp: room.bossHp, result: room.result, hurt: room.hurt > 0, players: room.players.map(({ ws, input, lastShot, revive, ...player }) => player), arrows: room.arrows, shots: room.shots, fireballs: room.fireballs, pickups: room.pickups };
}
function broadcast(room, message) {
  const data = JSON.stringify(message);
  for (const player of room.players) if (player.ws.readyState === WebSocket.OPEN) player.ws.send(data);
}
function state(room) { broadcast(room, { type: 'state', state: pub(room) }); }
function join(ws, room, name) {
  if (room.players.length >= 3) return ws.send(JSON.stringify({ type: 'error', message: '이 방은 이미 3명입니다' }));
  const id = Math.random().toString(36).slice(2, 9), slot = Math.min(3, room.players.length + 1);
  const player = { id, slot, name: String(name || '이름 없는 기사').slice(0, 10), x: 130 + room.players.length * 60, y: 250 + room.players.length * 60, color: COLORS[slot - 1], hp: 3, alive: true, damage: 0, revive: 0, input: { x: 0, y: 0, shoot: false }, lastShot: 0, ws };
  room.players.push(player); ws.room = room.code; ws.pid = id;
  ws.send(JSON.stringify({ type: 'joined', room: room.code, playerId: id })); state(room);
}
function reset(room) {
  Object.assign(room, { phase: 'playing', elapsed: 0, coins: 0, bossHp: 100, result: null, arrows: [], shots: [], fireballs: [], pickups: [], spawn: .7, fireSpawn: 5, coinSpawn: 3, hurt: 0, netClock: 0 });
  room.players.forEach((player, index) => Object.assign(player, { x: 125, y: 230 + index * 80, hp: 3, alive: true, damage: 0, revive: 0, lastShot: 0 }));
}

wss.on('connection', ws => {
  ws.on('message', raw => {
    let message;
    try { message = JSON.parse(raw); } catch { return; }
    if (message.type === 'create') {
      let code; do code = newCode(); while (rooms.has(code));
      const room = fresh(code, null); rooms.set(code, room); join(ws, room, message.name); room.hostId = ws.pid; state(room); return;
    }
    if (message.type === 'join') {
      const room = rooms.get(String(message.code || '').toUpperCase());
      if (!room) return ws.send(JSON.stringify({ type: 'error', message: '방을 찾을 수 없습니다' }));
      if (room.phase === 'playing') return ws.send(JSON.stringify({ type: 'error', message: '이미 전투가 시작된 방입니다' }));
      join(ws, room, message.name); return;
    }
    const room = rooms.get(ws.room), player = room?.players.find(candidate => candidate.id === ws.pid);
    if (!room || !player) return;
    if (message.type === 'start' && room.hostId === player.id) { reset(room); state(room); }
    if (message.type === 'restart') { reset(room); state(room); }
    if (message.type === 'input') player.input = { x: Math.max(-1, Math.min(1, Number(message.x) || 0)), y: Math.max(-1, Math.min(1, Number(message.y) || 0)), shoot: Boolean(message.shoot) };
  });
  ws.on('close', () => {
    const room = rooms.get(ws.room); if (!room) return;
    room.players = room.players.filter(player => player.id !== ws.pid);
    if (!room.players.length) rooms.delete(room.code);
    else { if (room.hostId === ws.pid) room.hostId = room.players[0].id; state(room); }
  });
});

function spawnArrow(room) {
  const alive = room.players.filter(player => player.alive), target = alive[Math.floor(Math.random() * alive.length)];
  if (!target) return;
  const edge = room.elapsed < 25 ? 0 : Math.floor(Math.random() * 4); let x, y;
  if (edge === 0) { x = 930; y = 50 + Math.random() * 440; }
  else if (edge === 1) { x = 20; y = 50 + Math.random() * 440; }
  else if (edge === 2) { x = 40 + Math.random() * 780; y = 20; }
  else { x = 40 + Math.random() * 780; y = 510; }
  const speed = 210 + Math.min(230, room.elapsed * 1.1), angle = Math.atan2(target.y - y, target.x - x);
  room.arrows.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
}
function spawnFireball(room) {
  const alive = room.players.filter(player => player.alive), target = alive[Math.floor(Math.random() * alive.length)];
  if (!target) return;
  const x = 815, y = 205 + Math.random() * 130, angle = Math.atan2(target.y - y, target.x - x);
  room.fireballs.push({ x, y, vx: Math.cos(angle) * 175, vy: Math.sin(angle) * 175 });
}

function tick() {
  const now = Date.now();
  for (const room of rooms.values()) {
    const dt = Math.min(.05, (now - room.last) / 1000); room.last = now;
    if (room.phase !== 'playing') continue;
    room.elapsed += dt; room.spawn -= dt; room.fireSpawn -= dt; room.coinSpawn -= dt; room.netClock -= dt; room.hurt = Math.max(0, room.hurt - dt);
    if (room.spawn <= 0) { spawnArrow(room); if (room.elapsed > 60 && Math.random() < .42) spawnArrow(room); room.spawn = Math.max(.11, .72 - room.elapsed * .003); }
    if (room.fireSpawn <= 0) { spawnFireball(room); room.fireSpawn = 5; broadcast(room, { type: 'notice', message: '괴물이 즉사 불꽃을 던졌습니다!' }); }
    if (room.coinSpawn <= 0) { room.pickups.push({ x: 760, y: 70 + Math.random() * 400 }); room.coinSpawn = 5 + Math.random() * 3; }
    for (const player of room.players) {
      if (!player.alive) continue;
      const length = Math.hypot(player.input.x, player.input.y) || 1;
      player.x = Math.max(28, Math.min(790, player.x + player.input.x / length * 185 * dt));
      player.y = Math.max(45, Math.min(500, player.y + player.input.y / length * 185 * dt));
      player.lastShot -= dt;
      if (player.input.shoot && player.lastShot <= 0) { room.shots.push({ x: player.x + 18, y: player.y - 6, vx: 520, ownerId: player.id }); player.lastShot = .38; }
    }
    for (const arrow of room.arrows) {
      arrow.x += arrow.vx * dt; arrow.y += arrow.vy * dt;
      for (const player of room.players) if (player.alive && Math.abs(arrow.x - player.x) < 17 && Math.abs(arrow.y - player.y) < 22) {
        player.hp = Math.max(0, player.hp - 1); arrow.dead = true;
        if (player.hp <= 0) { player.alive = false; broadcast(room, { type: 'notice', message: `${player.name}님의 체력이 모두 줄어 쓰러졌습니다!` }); }
        else broadcast(room, { type: 'notice', message: `${player.name}님 화살 피격 · 체력 ${player.hp}/3` });
      }
    }
    for (const fireball of room.fireballs) {
      fireball.x += fireball.vx * dt; fireball.y += fireball.vy * dt;
      for (const player of room.players) if (player.alive && Math.hypot(fireball.x - player.x, fireball.y - player.y) < 27) { player.hp = 0; player.alive = false; fireball.dead = true; broadcast(room, { type: 'notice', message: `${player.name}님이 불꽃에 맞아 즉사했습니다!` }); }
    }
    for (const shot of room.shots) {
      shot.x += shot.vx * dt;
      if (shot.x > 815) {
        shot.dead = true;
        const damage = Math.min(2, room.bossHp); room.bossHp = Math.max(0, room.bossHp - damage);
        const owner = room.players.find(player => player.id === shot.ownerId); if (owner) owner.damage += damage;
        room.hurt = .38;
      }
    }
    for (const coin of room.pickups) for (const player of room.players) if (player.alive && Math.hypot(coin.x - player.x, coin.y - player.y) < 24) { coin.dead = true; room.coins++; }
    for (const downed of room.players.filter(player => !player.alive)) {
      const near = room.players.some(player => player.alive && Math.hypot(player.x - downed.x, player.y - downed.y) < 55);
      downed.revive = near ? downed.revive + dt : Math.max(0, downed.revive - dt);
      if (downed.revive >= 3) { downed.hp = 3; downed.alive = true; downed.revive = 0; broadcast(room, { type: 'notice', message: `${downed.name}님이 체력을 회복하고 다시 일어났습니다!` }); }
    }
    room.arrows = room.arrows.filter(arrow => !arrow.dead && arrow.x > -50 && arrow.x < 1010 && arrow.y > -50 && arrow.y < 590);
    room.fireballs = room.fireballs.filter(fireball => !fireball.dead && fireball.x > -80 && fireball.x < 1040 && fireball.y > -80 && fireball.y < 620);
    room.shots = room.shots.filter(shot => !shot.dead); room.pickups = room.pickups.filter(coin => !coin.dead);
    if (room.bossHp <= 0 || room.elapsed >= 300) { room.phase = 'ended'; room.result = 'win'; }
    else if (room.players.every(player => !player.alive)) { room.phase = 'ended'; room.result = 'lose'; }
    if (room.netClock <= 0 || room.phase === 'ended') { state(room); room.netClock = .1; }
  }
}

setInterval(tick, 50);
server.listen(PORT, '0.0.0.0', () => console.log(`coop server listening on ${PORT}`));
