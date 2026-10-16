(() => {
  'use strict';
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height, MAX_TIME = 300;
  const $ = s => document.querySelector(s);
  const ui = { time:$('#timeText'), best:$('#bestText'), coins:$('#coinText'), boss:$('#bossText'), start:$('#startScreen'), end:$('#endScreen'), countdown:$('#countdown'), result:$('#resultText'), winner:$('#winnerText'), medal:$('#medal'), endLabel:$('#endLabel'), sound:$('#soundBtn') };
  let mode='menu', playerCount=1, elapsed=0, last=0, spawnClock=0, coinClock=0, bossHP=100, shake=0, message='', messageClock=0, audioOn=true, audioCtx=null;
  let players=[], arrows=[], shots=[], coins=[], particles=[];
  const keys=new Set(), pressed=new Set();
  const controls=[
    {up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',shoot:'ShiftLeft',color:'#d94a31',dark:'#772b20',name:'빨강 기수'},
    {up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',shoot:'KeyF',color:'#3265a7',dark:'#193a68',name:'파랑 기수'},
    {up:'KeyI',down:'KeyK',left:'KeyJ',right:'KeyL',shoot:'KeyH',color:'#34875d',dark:'#174b31',name:'초록 기수'}
  ];
  let best=Number(localStorage.getItem('arrow-best')||0);
  const fmt=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}.${Math.floor((t%1)*10)}`;
  ui.best.textContent=fmt(best);

  function beep(freq=300,dur=.06,type='square',vol=.025){ if(!audioOn)return; try{ audioCtx ||= new (window.AudioContext||window.webkitAudioContext)(); const o=audioCtx.createOscillator(),g=audioCtx.createGain(); o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(vol,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);}catch{} }
  function reset(){
    elapsed=0;spawnClock=0;coinClock=0;bossHP=100;arrows=[];shots=[];coins=[];particles=[];shake=0;message='';
    players=controls.slice(0,playerCount).map((c,i)=>({x:120+i*70,y:H/2+(i-1)*84,w:28,h:36,alive:true,coins:0,c,shootCd:0,step:0}));
    updateUI();
  }
  function begin(){ reset();ui.start.classList.remove('visible');ui.end.classList.remove('visible');mode='countdown';let n=3;ui.countdown.textContent=n;ui.countdown.classList.add('visible');beep(440,.12);const timer=setInterval(()=>{n--;if(n){ui.countdown.textContent=n;beep(440+n*80,.12)}else{clearInterval(timer);ui.countdown.textContent='GO!';beep(780,.18);setTimeout(()=>{ui.countdown.classList.remove('visible');mode='play';last=performance.now()},520)}},700); }
  function tier(){ return elapsed<15?0:elapsed<30?1:elapsed<60?2:3; }
  function spawnArrow(){
    const t=tier(), side=t<2?3:Math.random()<.73?3:Math.floor(Math.random()*3); let x,y,vx=0,vy=0;
    const speed=235+t*70+Math.min(elapsed,180)*.65+Math.random()*70;
    const target=players.filter(p=>p.alive); const aim=target.length?target[Math.floor(Math.random()*target.length)]:{x:W/3,y:H/2};
    if(side===3){x=W+30;y=45+Math.random()*(H-90);vx=-speed;vy=(aim.y-y)*(.16+Math.random()*.15)}
    else if(side===0){x=20+Math.random()*(W-260);y=-25;vy=speed;vx=(aim.x-x)*.12}
    else if(side===1){x=20+Math.random()*(W-260);y=H+25;vy=-speed;vx=(aim.x-x)*.12}
    else{x=-30;y=40+Math.random()*(H-80);vx=speed;vy=(aim.y-y)*.12}
    arrows.push({x,y,vx,vy,r:8,angle:Math.atan2(vy,vx)});
  }
  function difficultyEvent(){ const marks=[15,30,60]; if(marks.some(m=>elapsed>=m&&elapsed< m+.04)){message=elapsed<30?'속도가 빨라집니다!':elapsed<60?'사방 공격 시작!':'극한의 화살비!';messageClock=2.1;beep(160,.35,'sawtooth',.04)} }
  function update(dt){
    if(mode!=='play')return; elapsed=Math.min(MAX_TIME,elapsed+dt); difficultyEvent();
    const alive=players.filter(p=>p.alive); if(!alive.length){finish(false);return} if(playerCount>1&&alive.length===1){finish(false);return} if(elapsed>=MAX_TIME){finish(true);return}
    const t=tier(); spawnClock-=dt; const interval=Math.max(.09,.68-t*.13-elapsed*.0021);
    if(spawnClock<=0){spawnArrow();if(t===3&&Math.random()<.48)spawnArrow();spawnClock=interval*(.72+Math.random()*.55)}
    coinClock-=dt;if(coinClock<=0){coins.push({x:W+20,y:70+Math.random()*(H-140),vx:-125,r:12,spin:0});coinClock=4.2+Math.random()*3.5}
    for(const p of players){ if(!p.alive)continue; let dx=(keys.has(p.c.right)?1:0)-(keys.has(p.c.left)?1:0),dy=(keys.has(p.c.down)?1:0)-(keys.has(p.c.up)?1:0);if(dx||dy){const len=Math.hypot(dx,dy);dx/=len;dy/=len;p.x+=dx*210*dt;p.y+=dy*210*dt;p.step+=dt*12}p.x=Math.max(22,Math.min(W-190,p.x));p.y=Math.max(30,Math.min(H-30,p.y));p.shootCd-=dt;if((keys.has(p.c.shoot)||(p.c.shoot==='ShiftLeft'&&keys.has('ShiftRight')))&&p.shootCd<=0){shots.push({x:p.x+22,y:p.y-10,vx:520,owner:p});p.shootCd=.33;beep(510,.035)}}
    for(const a of arrows){a.x+=a.vx*dt;a.y+=a.vy*dt}
    for(const s of shots)s.x+=s.vx*dt;
    for(const c of coins){c.x+=c.vx*dt;c.spin+=dt*8}
    for(const q of particles){q.x+=q.vx*dt;q.y+=q.vy*dt;q.life-=dt}
    for(const a of arrows)for(const p of players){if(p.alive&&Math.abs(a.x-p.x)<17&&Math.abs(a.y-(p.y-5))<22){p.alive=false;a.dead=true;burst(p.x,p.y,p.c.color,18);shake=9;beep(90,.35,'sawtooth',.05);message=`${p.c.name} 탈락 · 관전 중`;messageClock=2.2}}
    for(const c of coins)for(const p of players){if(p.alive&&Math.hypot(c.x-p.x,c.y-p.y)<25){c.dead=true;p.coins++;burst(c.x,c.y,'#dda92e',8);beep(920,.08)}}
    for(const s of shots){if(s.x>W-142&&s.x<W-66&&s.y>150&&s.y<390){s.dead=true;bossHP=Math.max(0,bossHP-2);burst(s.x,s.y,'#d94a31',4);if(bossHP===0){bossHP=100;players.forEach(p=>p.coins+=10);message='괴물 격파! +10 코인';messageClock=2.5;beep(120,.5,'square',.05)}}}
    arrows=arrows.filter(a=>!a.dead&&a.x>-70&&a.x<W+70&&a.y>-70&&a.y<H+70);shots=shots.filter(s=>!s.dead&&s.x<W+30);coins=coins.filter(c=>!c.dead&&c.x>-30);particles=particles.filter(q=>q.life>0);messageClock-=dt;shake*=.84;updateUI();
  }
  function burst(x,y,color,n){for(let i=0;i<n;i++){const a=Math.random()*6.28,sp=30+Math.random()*100;particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.35+Math.random()*.35,color})}}
  function updateUI(){ui.time.textContent=fmt(elapsed);ui.coins.textContent=String(players.reduce((n,p)=>n+p.coins,0)).padStart(3,'0');ui.boss.textContent='■'.repeat(Math.ceil(bossHP/10))+'□'.repeat(10-Math.ceil(bossHP/10));}
  function finish(win){mode='end';best=Math.max(best,elapsed);localStorage.setItem('arrow-best',best);ui.best.textContent=fmt(best);const survivors=players.filter(p=>p.alive);const medal=elapsed>=60?'🥇':elapsed>=30?'🥈':'🥉';ui.medal.textContent=win?'🏆':medal;ui.endLabel.textContent=win?'MISSION CLEAR':'GAME OVER';ui.winner.textContent=win?'5분 생존 성공!':survivors.length===1&&playerCount>1?`${survivors[0].c.name} 승리!`:'도전 종료';ui.result.textContent=`생존 ${fmt(elapsed)} · 코인 ${players.reduce((n,p)=>n+p.coins,0)}개`;ui.end.classList.add('visible');beep(win?880:100,.65,'square',.05)}
  function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h)}
  function drawHorse(p){const bob=Math.sin(p.step)*2;ctx.save();ctx.translate(Math.round(p.x),Math.round(p.y+bob));ctx.fillStyle=p.c.dark;ctx.fillRect(-17,4,31,14);ctx.fillRect(-12,17,6,13);ctx.fillRect(7,17,6,13);ctx.fillRect(10,-2,12,10);ctx.fillRect(17,-8,8,9);ctx.fillStyle='#1b1712';ctx.fillRect(21,-5,3,3);ctx.fillStyle=p.c.color;ctx.fillRect(-7,-17,15,15);ctx.fillStyle='#f1c6a0';ctx.fillRect(-5,-27,12,11);ctx.fillStyle='#2b1b15';ctx.fillRect(-7,-29,16,5);ctx.fillStyle='#111';ctx.fillRect(3,-23,2,2);ctx.restore()}
  function drawArrow(a){ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.angle);rect(-19,-2,32,4,'#3a2920');ctx.fillStyle='#d94a31';ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(8,-7);ctx.lineTo(8,7);ctx.closePath();ctx.fill();rect(-20,-7,5,14,'#68624d');ctx.restore()}
  function drawBoss(){ctx.save();ctx.translate(W-92,H/2);ctx.fillStyle='#5d6e45';ctx.fillRect(-42,-90,70,180);ctx.fillRect(-58,-62,25,48);ctx.fillStyle='#788c59';ctx.fillRect(-33,-103,50,48);ctx.fillStyle='#efe1b5';ctx.fillRect(-24,-89,11,11);ctx.fillRect(1,-89,11,11);ctx.fillStyle='#171713';ctx.fillRect(-21,-86,5,5);ctx.fillRect(4,-86,5,5);ctx.fillStyle='#d94a31';ctx.fillRect(-18,-65,27,8);ctx.fillStyle='#3f4d31';ctx.fillRect(-31,90,24,20);ctx.fillRect(10,90,24,20);ctx.restore()}
  function draw(){ctx.save();ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);ctx.fillStyle='#e7e3d6';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#c4c0b4';ctx.lineWidth=1;for(let x=40;x<W;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}for(let y=40;y<H;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}ctx.fillStyle='#d2cebf';ctx.fillRect(0,H-34,W,34);drawBoss();for(const c of coins){ctx.fillStyle='#dda92e';ctx.beginPath();ctx.arc(c.x,c.y,12,0,6.28);ctx.fill();ctx.fillStyle='#fff0a7';ctx.fillRect(c.x-2,c.y-7,4,14)}for(const p of players){if(p.alive)drawHorse(p);else{ctx.globalAlpha=.34;drawHorse(p);ctx.globalAlpha=1;ctx.fillStyle='#171713';ctx.font='bold 11px monospace';ctx.fillText('관전',p.x-14,p.y-38)}}for(const a of arrows)drawArrow(a);for(const s of shots){rect(s.x-10,s.y-2,20,4,s.owner.c.color);ctx.fillStyle=s.owner.c.color;ctx.beginPath();ctx.moveTo(s.x+15,s.y);ctx.lineTo(s.x+7,s.y-6);ctx.lineTo(s.x+7,s.y+6);ctx.fill()}for(const q of particles){ctx.globalAlpha=Math.max(0,q.life*2);rect(q.x,q.y,4,4,q.color)}ctx.globalAlpha=1;if(messageClock>0){ctx.fillStyle='#171713';ctx.fillRect(W/2-175,18,350,42);ctx.fillStyle='#fffaf0';ctx.font='bold 17px monospace';ctx.textAlign='center';ctx.fillText(message,W/2,45);ctx.textAlign='left'}ctx.restore()}
  function loop(now){const dt=Math.min(.033,(now-last)/1000||0);last=now;update(dt);draw();pressed.clear();requestAnimationFrame(loop)}
  addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(!keys.has(e.code))pressed.add(e.code);keys.add(e.code)});
  addEventListener('keyup',e=>keys.delete(e.code));
  document.querySelectorAll('.count').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.count').forEach(x=>x.classList.remove('active'));b.classList.add('active');playerCount=Number(b.dataset.count);beep(600,.05)}));
  $('#startBtn').addEventListener('click',begin);$('#retryBtn').addEventListener('click',begin);$('#menuBtn').addEventListener('click',()=>{ui.end.classList.remove('visible');ui.start.classList.add('visible');mode='menu';reset()});ui.sound.addEventListener('click',()=>{audioOn=!audioOn;ui.sound.textContent=audioOn?'♪ SOUND ON':'× SOUND OFF';if(audioOn)beep(620,.08)});
  reset();draw();requestAnimationFrame(loop);
})();
