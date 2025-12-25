// sdpController.js
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const mysql = require('mysql2');
const { exec } = require('child_process');
const config = require('./config/controller_config.json');

let nextConnectionId = 1;

// Replace with your server interface name from step 1
const SERVER_INTERFACE = 'enp0s3';

// MySQL pool
const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'sdp_controller',
    password: 'sdp',
    database: 'sdp',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const connectedClients = [];
const connectedGateways = [];

// Utility: write to socket
function writeToSocket(socket, message, closeAfter = false) {
    try {
        socket.write(message);
        if (closeAfter) socket.end();
    } catch (err) {
        console.error("Failed to write to socket:", err);
    }
}

// Allow ping dynamically for client IP on specific interface
function allowPing(clientIp) {
    if (!clientIp) return;

    if (clientIp.includes(':')) {
        const ipv6 = clientIp.split('%')[0];
        exec(`sudo ip6tables -I INPUT -i ${SERVER_INTERFACE} -p icmpv6 --icmpv6-type echo-request -s ${ipv6} -j ACCEPT`, (err) => {
            if (err) console.error(`IPv6  allow failed for ${ipv6}:`, err);
            else console.log(` IPv6 allowed for ${ipv6} on ${SERVER_INTERFACE}`);
        });
        return;
    }

    exec(`sudo iptables -I INPUT -i ${SERVER_INTERFACE} -p icmp --icmp-type 8 -s ${clientIp} -j ACCEPT`, (err) => {
        if (err) console.error(`IPv4  allow failed for ${clientIp}:`, err);
        else console.log(` IPv4 allowed for ${clientIp} on ${SERVER_INTERFACE}`);
    });
}

// Remove ping rule when client disconnects
function removePing(clientIp) {
    if (!clientIp) return;

    if (clientIp.includes(':')) {
        const ipv6 = clientIp.split('%')[0];
        exec(`sudo ip6tables -D INPUT -i ${SERVER_INTERFACE} -p icmpv6 --icmpv6-type echo-request -s ${ipv6} -j ACCEPT`, (err) => {
            if (err) console.error(`IPv6 removal failed for ${ipv6}:`, err);
            else console.log(` IPv6 removed for ${ipv6} on ${SERVER_INTERFACE}`);
        });
        return;
    }

    exec(`sudo iptables -D INPUT -i ${SERVER_INTERFACE} -p icmp --icmp-type 8 -s ${clientIp} -j ACCEPT`, (err) => {
        if (err) console.error(`IPv4  removal failed for ${clientIp}:`, err);
        else console.log(` IPv4 removed ${clientIp} on ${SERVER_INTERFACE}`);
    });
}

// TLS options
const options = {
    key: fs.readFileSync(path.join(__dirname, 'keys', 'server.key')),
    cert: fs.readFileSync(path.join(__dirname, 'keys', 'server.crt')),
    ca: fs.readFileSync(path.join(__dirname, 'keys', 'ca.crt')),
    requestCert: true,
    rejectUnauthorized: true
};

// TLS server
tls.createServer(options, (socket) => {
    const connectionId = nextConnectionId++;
    const sdpId = String(socket.getPeerCertificate().subject.CN).trim();
    socket.sdpId = sdpId;

    const clientIp = socket.remoteAddress.replace(/^::ffff:/, '');
    socket.clientIp = clientIp;

    if (config.debug) console.log(`Incoming connection SDP ID ${sdpId}, IP: ${clientIp}, connID: ${connectionId}`);

    socket.once('data', (data) => {
        let message;
        try { message = JSON.parse(data); } 
        catch (err) {
            writeToSocket(socket, JSON.stringify({ action: 'bad_message' }), true);
            return;
        }

        const clientPassword = message.password;
        if (!clientPassword) {
            writeToSocket(socket, JSON.stringify({ action: 'missing_password' }), true);
            return;
        }

        pool.query('SELECT * FROM sdpid WHERE TRIM(sdpid) = ?', [sdpId], (err, rows) => {
            if (err || rows.length !== 1) {
                writeToSocket(socket, JSON.stringify({ action: 'unknown_sdp_id' }), true);
                return;
            }

            const member = rows[0];
            if (member.valid == 0 || member.password !== clientPassword) {
                writeToSocket(socket, JSON.stringify({ action: 'invalid_credentials' }), true);
                return;
            }

            // Authenticated → allow ping on interface
            allowPing(clientIp);

            const destList = member.type === 'gateway' ? connectedGateways : connectedClients;
            destList.push({ sdpId, connectionId, socket, ip: clientIp, connectionTime: new Date() });

            console.log(`SDP ID ${sdpId} connected as ${member.type}`);
            writeToSocket(socket, JSON.stringify({ action: 'credentials_good' }), false);
        });
    });

    socket.on('error', (err) => console.error("Socket error:", err));

    socket.on('close', () => {
        removePing(socket.clientIp);

        let idx = connectedClients.findIndex(c => c.socket === socket);
        if (idx !== -1) connectedClients.splice(idx, 1);
        idx = connectedGateways.findIndex(g => g.socket === socket);
        if (idx !== -1) connectedGateways.splice(idx, 1);

        if (config.debug) console.log(`Connection ${connectionId} closed, ping revoked for ${socket.clientIp}`);
    });
}).listen(config.port, () => {
    console.log(`SDP Controller running at port ${config.port}`);
});

