const tls = require('tls');
const fs = require('fs');
const path = require('path');

/* ---------- ELEMENTS ---------- */
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusCircle = document.getElementById('statusCircle');
const statusText = document.getElementById('statusText');

const logEl = document.getElementById('log');
const toggleLogBtn = document.getElementById('toggleLogBtn');
const logContainer = document.getElementById('logContainer');
const logArrow = document.getElementById('logArrow');

const canvas = document.getElementById('bgCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

/* ---------- PARTICLES ---------- */
let particles = [];
for(let i=0;i<150;i++){
    particles.push({
        x: Math.random()*canvas.width,
        y: Math.random()*canvas.height,
        r: Math.random()*2+1,
        dx: Math.random()*0.5-0.25,
        dy: Math.random()*0.5-0.25
    });
}

function animateParticles(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let p of particles){
        ctx.beginPath();
        ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,0.2)';
        ctx.fill();
        p.x+=p.dx; p.y+=p.dy;
        if(p.x>canvas.width)p.x=0;
        if(p.x<0)p.x=canvas.width;
        if(p.y>canvas.height)p.y=0;
        if(p.y<0)p.y=canvas.height;
    }
    requestAnimationFrame(animateParticles);
}
animateParticles();

/* ---------- LOG ---------- */
let logOpen = false;
function log(msg, type='info'){
    const span = document.createElement('span');
    span.textContent = msg+'\n';
    span.className = `log-${type}`;
    logEl.appendChild(span);
    logEl.scrollTop = logEl.scrollHeight;
}

/* ---------- STATUS ---------- */
function updateStatus(connected){
    if(connected){
        statusCircle.style.backgroundColor = '#28a745';
        statusCircle.classList.add('pulse');
        statusText.textContent = 'Connected';
    } else {
        statusCircle.style.backgroundColor = 'red';
        statusCircle.classList.remove('pulse');
        statusText.textContent = 'Disconnected';
    }
}

/* ---------- LOG TOGGLE ---------- */
toggleLogBtn.onclick = () => {
    logOpen = !logOpen;
    if(logOpen){
        logContainer.style.maxHeight='220px';
        logArrow.classList.add('open');
        toggleLogBtn.querySelector('span').textContent='Hide Log';
    } else {
        logContainer.style.maxHeight='0';
        logArrow.classList.remove('open');
        toggleLogBtn.querySelector('span').textContent='Show Log';
    }
};

/* ---------- TLS CONNECTION ---------- */
let client = null;

connectBtn.onclick = () => {
    if(client){
        log('Already connected.', 'error');
        return;
    }

    const host = 'virtualperimeter.local';
    const port = 5000;
    const sdpId = document.getElementById('sdpId').value;
    const password = document.getElementById('password').value;

    const options = {
        host,
        port,
        key: fs.readFileSync(path.join(__dirname,'keys','client.key')),
        cert: fs.readFileSync(path.join(__dirname,'keys','client.crt')),
        ca: fs.readFileSync(path.join(__dirname,'keys','ca.crt')),
        rejectUnauthorized: true
    };

    client = tls.connect(options, ()=>{
        log(`Connected to SDP Controller at ${host}:${port}`,'success');
        const msg = JSON.stringify({sdpId,password});
        client.write(msg);
        log(`Sent SDP ID: ${sdpId} and password`,'info');
        disconnectBtn.disabled=false;
        connectBtn.disabled=true;
        updateStatus(true);
    });

    client.on('data',(data)=>{
        log(`Server: ${data.toString()}`,'info');
    });

    client.on('error',(err)=>{
        log(`Connection error: ${err.message}`,'error');
        cleanup();
    });

    client.on('close',()=>{
        log('Connection closed','info');
        cleanup();
    });
};

/* ---------- DISCONNECT ---------- */
disconnectBtn.onclick = () => {
    if(client){
        log('Disconnecting...','info');
        client.end();
    }
};

function cleanup(){
    client=null;
    disconnectBtn.disabled=true;
    connectBtn.disabled=false;
    updateStatus(false);
}
