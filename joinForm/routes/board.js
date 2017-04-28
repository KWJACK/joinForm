var express = require('express')
  , path = require('path')
  , router = express.Router()
  , multer = require('multer')
  , mysql = require('mysql')
  , fs = require('fs')
  , static = require('serve-static')
  , app = express();

// app.set('view engine', 'pug'); pug사용시 적용
// app.locals.pretty = true;
var bodyParser = require('body-parser');
var bkfd2Password = require('pbkdf2-password'); //비밀번호 암호화 npm
var session = require('express-session'); //session 기능용 npm
var MySQLStore = require('express-mysql-session')(session);//session라는 테이블을 생성하게됨
var passport = require('passport');//passport-인증방법(ex, facebook, twitter etc..)
var LocalStrategy = require('passport-local').Strategy; //로컬 방식의 passport이용
var hasher = bkfd2Password();

app.use(express.static(__dirname));


router.use(session({//express-session. session을 사용할 수 있도록 붙임
  secret: '1234DSFs@adf1234!@#$asd', //secret , session id로 넣을 값
  resave: false,    // session을 계속 발생시키지 않도록
  saveUninitialized: true,  //session을 사용전까지 발급안함
  store:new MySQLStore({//접속할 데이터베이스 지정
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '1111',
    database: 'test'
  })  //서버가 닫히면 session이 초기화 되므로 session을 기록하는 위치
}));

router.use(passport.initialize()); //passport 시 필수 구문
router.use(passport.session());   //필 수 구 문. session을 이전에 세팅해놓고 추가

passport.serializeUser((user, done)=>{//passport.use에서 done으로 준 객체를 첫번쨰 인자로 받음
  //console.log('serializeUser', user)
  done(null, user.authId);//session에 현재 접근한 user의 authId를 등록
});

passport.deserializeUser((authId, done)=>{//serializeUser에서 session에 저장한 값을 첫번째 param으로
  //console.log('deserializeUser', authId);
  var sql = "SELECT * FROM users WHERE authId=?";
  pool.getConnection((err, connection)=>{
    connection.query(sql, [authId], (err, results)=>{
      if(err){
        console.log(err);
        done('There is no user.');
      }else{
        done(null, results[0]);
      }
    });
    connection.release();
  });
});

var _storage = multer.diskStorage({ // 파일 저장 형식 지정
  destination: function (req, file, cb) {//어디에 저장할지
    cb(null, 'public/images')//cb = callback
  },
  filename: function (req, file, cb) {//제목
    cb(null, new Date().getTime()+file.originalname)
  }
});

var upload = multer({storage: _storage}); //multer 옵션. 저장 디렉토리 지정
var pool = mysql.createPool({
  connectionLimit: 5,
  host: 'localhost',
  user: 'root',
  database: 'test',
  password: '1111'
});

router.get('/', (req,res, next)=>{
  res.redirect('/board/list/1');
});

router.get('/list/:page', (req,res,next)=>{
  pool.getConnection((err, connection)=>{
    var sql = "SELECT idx, creator_id, title, hit FROM board";
    connection.query(sql, (err, rows)=>{
      console.log(req.session);
      if(err) console.error("err: " + err);
      else{
         if(req.user!=null){
          res.render('list.ejs', {title: '게시판 전체 글 조회', rows: rows, user: req.user.username});
         }else{
             res.render('list.ejs', {title: '게시판 전체 글 조회', rows: rows, user:[""]});
         }
      }
      connection.release();
    });
  });
});

router.get('/write', (req, res, next)=>{
  if(req.user!=null){ //사용자 세션이 있으면 글쓰기로 이동
    res.render('write.ejs', {title:"게시판 글 쓰기", user:req.user.username});
  }else{//사용자 세션이 없으면 회원가입
    res.redirect('../join')
  }
});
//upload.array와 upload.single이 있음
router.post('/write', upload.single('attachFile'), (req, res, next)=>{
  var creator_id = req.body.creator_id;
  var title = req.body.title;
  var content = req.body.content;
  var password = req.user.password; //로그인 사용자의 암호를 DB에 저장
  var image = req.file;
  if(image==null){//이미지 파일 업로드 안했을 때
    var datas = [creator_id, title, content, password];
    var sql = "INSERT INTO board (creator_id, title, content, password) VALUES(?, ?, ?, ?)";
  } else{//했을때, image.file추가
    var datas = [creator_id, title, content, password, image.filename];
    var sql = "INSERT INTO board (creator_id, title, content, password, image) VALUES(?, ?, ?, ?, ?)";
  }
  pool.getConnection((err, connection)=>{
    connection.query(sql, datas, (err, rows)=>{
      if(err) console.error("err :" + err);
      res.redirect('/board/read/'+encodeURIComponent(rows.insertId));
      connection.release();
    })
  });
});

router.get('/read/:idx', (req, res, next)=>{
  var idx = req.params.idx;
  pool.getConnection((err, connection)=>{
    var sql = "SELECT idx, creator_id, title, content, hit, image FROM board WHERE idx=?";
    connection.query(sql, [idx], (err, row)=>{
      if(err) console.error(err);
      else{
        console.log("1개 글 조회 결과 확인 : ", row);
        var hit = row[0].hit;
        hit++;
        var sql = "UPDATE board SET hit=? WHERE idx=?"
        connection.query(sql, [hit,idx], (err, hitup)=>{
          //조회수 1 증가
        });
        if(req.user!=null){
          if(req.user.username == row[0].creator_id){//글 작성자가 자기 게시물 확인 시
            res.render('read.ejs', {title: "글 조회", row:row[0], user:req.user.username});
          }else{
            res.render('read.ejs', {title: "글 조회", row:row[0], user:[""]});
          }
        }else{//일반 사용자가 게시물 확인 시, 차이는 글 삭제, 글 수정 버튼이 안보임
          res.render('read.ejs', {title: "글 조회", row:row[0], user:[""]});
        }
      }
      connection.release();
    });
  });
});

router.get('/update', (req, res, next)=>{
  var idx = req.query.idx;
  pool.getConnection((err, connection)=>{
    if(err) console.error("커넥션 객체 얻어오기 에러 : " +  err);
    var sql = "SELECT idx, creator_id, title, content, hit, image FROM board WHERE idx=?";
    connection.query(sql, [idx], (err,rows)=>{
      if(err) console.error(err);
      //console.log("update에서 1개글 조회 결과 확인: " + rows);
      res.render('update.ejs', {title:"글 수정", row:rows[0]});
      connection.release();
    });
  });
});

// upload.single('attachFile')
router.post('/update', upload.single('attachFile'), (req, res, next)=>{
  var idx = req.body.idx;
  var title = req.body.title;
  var content = req.body.content;
  var passwd = req.body.password;
  var sql = "SELECT password, image FROM board WHERE idx=?";
  pool.getConnection((err, connection)=>{
    connection.query(sql, idx, (err, result)=>{
      if(err) console.error("글 수정 중 에러 발생 :" + err);
      else{
        hasher({password: passwd, salt: req.user.salt},function(err, pass, salt, hash){
          if(result[0].password == hash){
              if(req.file==null){
                sql = "UPDATE board SET title=?, content=? WHERE idx=?";
                var data = [title, content, idx];
              }else{
                sql = "UPDATE board SET title=?, content=?, image=? WHERE idx=?";
                var data = [title, content, req.file.filename, idx];
                fs.unlink('public/images/'+ result[0].image, (err)=>{//unlink=파일삭제
                  if(err)console.log(err);
                  else{
                    console.log("서버 DB 삭제 완료");
                  }
                });
              }
              connection.query(sql, data, (err, update)=>{  //
                //(update[0].affectedRows==0이면 결과 update안된 것을 뜻함
                res.redirect('/board/read/'+idx);
              });
          }else{
            res.send("<script>alert('패스워드가 일치하지 않거나, 잘못된 요청으로 인해 값이 변경되지 않습니다.');\
            history.back();</script>");
          }
        });
      }//else
      connection.release();
    });
  });
});


//삭제확인 버튼 클릭시 처리
router.post('/deleteConfirm/:idx', (req, res)=>{//POST형식
  var passwd = req.body.password;  //JSON형태의 값에서 value(passwd를 받음)
  var password;
  console.log(req.user.salt);
  hasher({password: passwd, salt: req.user.salt},function(err, pass, salt, hash){
    var idx = req.params.idx;
    pool.getConnection((err, connection)=>{//connection하여 sql 쿼리 보냄
      var sql = "SELECT password, image FROM board WHERE idx=?";
      connection.query(sql, idx, (err, results)=>{//passwd와 image는 results에 저장
        var sql = "DELETE FROM board WHERE idx=?";
        if(results[0].password == hash){//passwd가 일치하면
          if(results[0].image==""){//image가 없는 글일 경우
            connection.query(sql, idx, (err, results)=>{
              res.redirect('/'); //redirect후 read.ejs에서 처리
            });
          }else{//이미지가 있으면 DB뿐아니라 서버에서 이미지 파일도 같이 삭제해야함
            fs.unlink('public/images/'+ results[0].image, (err)=>{//unlink=파일삭제
              if(err)console.log(err);
              else{
                 connection.query(sql, idx, (err, results)=>{
                   console.log("delete the board in DB");
                   res.redirect('/');
                 });
              }
            });
          }//image가 있다면(else)
        }

        else{
        /*pass가 일치하지 않는 경우*/
            console.log("dddd");
        }
        connection.release();
      });
    });
  });
});

module.exports = router;
