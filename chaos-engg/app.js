const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const router = require('./router');
const session = require('express-session');

const app = express();
app.use(bodyParser.urlencoded({ extended: true })); 

app.use(session({secret: 'test_session', resave: true, saveUninitialized: true}))

app.set('view engine', 'ejs')

app.use(cookieParser())

app.use('/', router)

app.use('/public', express.static(path.join(__dirname, 'public')))

const port = 5001;

app.listen(port,function(err){
    if(err) console.log("error in server setup")
    console.log("Server listening to port", port)
})
