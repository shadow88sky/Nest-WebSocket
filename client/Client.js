var express = require('express');
var app = express();
var server = require('http').createServer(app);
server.listen(3001);

//引用的应该是socket.io-client;
var io = require('socket.io-client');
//connect函数可以接受一个url参数，url可以socket服务的http完整地址，也可以是相对路径，如果省略则表示默认连接当前路径。
// 与服务端类似，客户端也需要注册相应的事件来捕获信息，不同的是客户端连接成功的事件是connect。
//如果要传参，写法为var socket = io.connect('/',{ _query:'sid=123456'}); 服务器端取参数为var sid =socket.request._query.sid;
var socket = io.connect('http://127.0.0.1:3000');
socket.on('connect', function () {
    console.log('connect successed');
    socket.emit('userid', 'abcd', (data) => {
        console.log(data)
    })
});
//socket失去连接时触发（包括关闭浏览器，主动断开，掉线等任何断开连接的情况）
socket.on('disconnect', function () {
    console.log("server disconnect");
})

socket.on('hello', function (data) {
    console.log(data);
})