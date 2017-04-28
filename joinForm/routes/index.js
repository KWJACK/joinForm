var express = require('express');
var mysql = require('mysql');
var app = express();
var router = express.Router();
var pool = mysql.createPool({
  connectionLimit: 5,
  host: 'localhost',
  user: 'root',
  database: 'test',
  password: '1111'
});


/* GET home page. */
router.get('/', function(req, res, next) {
  pool.getConnection((err, connection)=>{
    connection.query('SELECT * FROM board', (err, rows)=>{
      if(err) console.error("err :" + err);
      console.log("rows: "+JSON.stringify(rows[1]));
      res.render('index.ejs', { title: 'test', rows: rows});
      connection.release();
    });
  });
});

module.exports = router;
