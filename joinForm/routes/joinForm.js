var express = require('express');
var session = require('express-session'); //session 기능용 npm
var MySQLStore = require('express-mysql-session')(session);//session라는 테이블을 생성하게됨
var bodyParser = require('body-parser');
var bkfd2Password = require('pbkdf2-password'); //비밀번호 암호화 npm
var passport = require('passport');//passport-인증방법(ex, facebook, twitter etc..)
var LocalStrategy = require('passport-local').Strategy; //로컬 방식의 passport이용
var mysql = require('mysql');
var hasher = bkfd2Password();
var pool = mysql.createPool({
  connectionLimit: 5,
  host: 'localhost',
  user: 'root',
  database: 'test',
  password: '1111'
});
//비밀번호는 1111임..
//var app = express();
var router = express.Router();

router.use(bodyParser.urlencoded({extended: false}));

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
  done(null, user.username);//session에 현재 접근한 user의 authId를 등록
});

passport.deserializeUser((username, done)=>{//serializeUser에서 session에 저장한 값을 첫번째 param으로
  //console.log('deserializeUser', authId);
  var sql = "SELECT * FROM users WHERE username=?";
  pool.getConnection((err, connection)=>{
    connection.query(sql, [username], (err, results)=>{
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

// login에서 입력한 정보를 DB와 비교
passport.use(new LocalStrategy(//위에서 정의한 local을 미들웨어로 사용.
  function(username, password, done){//미들웨어 구현
    var uname = username;
    var pwd = password;
    //console.log('pwd: '+pwd+'uname : '+ uname);
    var sql = 'SELECT * FROM users WHERE username=?';
    pool.getConnection((err, connection)=>{
      connection.query(sql, [uname], (err, results)=>{
        //console.log(results);
        if(err){
          //console.log(err);
          return done('There is no user.');
        }else{
          var user = results[0];
          return hasher({password: pwd, salt: user.salt},function(err, pass, salt, hash){//pass:암호화하려는 원래값, salt:암호화 매핑 salt값, hash: salt로 만든 단방향 암호. salt값이 매번 달라지기때문에 pass가 같아도 다르게 됨
            //console.log('hash  '+hash);
            //console.log('password  '+user.password);
            if(hash === user.password){//로그인된 상태
                //console.log('LocalStrategy', user);
                done(null, user);//두번째 인자는 전달할 객체
            }else{
                done(null, false);//로그인 절차가 끝났는데, fail했다는 의미
            }
          });
        }
      });
      connection.release();
    });
  }
));


router.get('/welcome', (req, res,next)=>{
  console.log('/router.get welcome : ');
  console.log(req.session);
  console.log(req.session.passport);
  console.log(req.user);
  if(req.user && req.session.passport.user){//passport가 만든 객체 user로 이용
    res.send(`
      <h1>Hello, ${req.user.name}</h1>
      <a href="/join/logout">logout</a>
      `)
  }else{
    res.send(`
      <h1>Welcome</h1>
      <a href="/join/register">register</a>
      <a href="/join/login">login</a>
      `)
  }
})

router.get('/logout', (req,res)=>{
  console.log("join get logout");
  req.logout();//passport가 제공
  req.session.save(()=>{
   res.redirect('/board');
  })
  delete req.session.name;
});


router.post('/register', (req, res, next)=>{
   hasher({password:req.body.password}, function(err,pass,salt, hash){
    var user = {
      authId:'local:'+req.body.username,
      username: req.body.username,
      password: hash,
      salt:salt,
      name: req.body.name
    };
    //console.log(user);
    var sql = "INSERT INTO users SET ?";
    pool.getConnection((err, connection)=>{
      connection.query(sql, user, (err, results)=>{
         if(err) console.error("err :" + err);
         else{
           req.login(user, (err)=>{
             req.session.save(()=>{
               res.redirect('/join/welcome');
             });
           });
         }
       });
     connection.release();
     });
 });
});

router.get('/login', (req, res, next)=>{
  var output =`
  <h1>Login</h1>
  <form action="/join/login" method="post">
    <p>
      <input type="text" name="username" palceholder="username">
    </p>
    <p>
      <input type="password" name="password" palceholder="password">
    </p>
    <p>
      <input type="submit">
    </p>
  </form>
  `;
  res.send(output);
});

router.post(
  '/login',
  passport.authenticate(
    'local', //미들웨어 local 사용
    {
      successRedirect: '/board',//로그인 성공시 board페이지로 이동
      failureRedirect: '/join/register',//실패시 가입페이지로
      failureFlash: false//인증에 실패할 때 메시지를 보이는 기능(true)
    }
  )
);

/*GET users listing.*/
router.get('/', (req, res, next)=>{
  if(req.user && req.session.passport.user){//passport가 만든 객체 user로 이용
    res.send(`
      <h1>Hello, ${req.user.name}</h1>
      <a href="/join/logout">logout</a>
      `);
  }else{
      res.render('joinForm.ejs', {title: 'Join Form!'});
  }
});


router.post('/', (req,res, next)=>{
  hasher({password: req.body.password}, function(err, pass, salt, hash){//암호화
    var user = {//DB에 넣을 데이터 순으로
      authId:'local:'+req.body.username,
      username: req.body.username,
      password: hash,
      salt: salt, //hash를 해석하기 위해 필요
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address,
      job: req.body.job,
      gender: req.body.gender,
      birth: req.body.birth
    };
    console.log("joinform hash result " + hash );
    console.log("joinform 입력 데이터 :" + user);
    var sql = "INSERT INTO users SET ?";
    pool.getConnection((err, connection)=>{
      connection.query(sql, user, (err, results)=>{
        if(err) console.error("err :" + err);
        else{
          req.login(user, (err)=>{
            req.session.save(()=>{
              res.redirect('/join/welcome');
            });
          });
        }
      });
      connection.release();
    });
  });
});

module.exports = router;
