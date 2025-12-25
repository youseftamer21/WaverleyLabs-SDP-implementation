const mysql = require('mysql');

const conn = mysql.createConnection({
    host: '127.0.0.1',
    user: 'sdp_controller',
    password: 'sdp',
    database: 'sdp',
    connectTimeout: 30000
});

conn.connect(err => {
    if(err) {
        console.error("Connection failed:", err.message);
    } else {
        console.log("Connected successfully!");
        conn.end();
    }
});
