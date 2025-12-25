const mysql = require('mysql');

const connection = mysql.createConnection({
  host: '127.0.0.1',
  user: 'sdp_controller',
  password: 'your_password',
  database: 'sdp_db',
  connectTimeout: 10000 // 10 seconds
});

connection.connect(err => {
  if(err) {
    console.error("Connection failed:", err.message);
  } else {
    console.log("Connection successful!");
    connection.end();
  }
});
