# Nest中使用WebSocket
很多情况下，我们需要使用WebSocket，Nest.js已经很好的集成了它。让我们使用起来方便不少。今天我们就来介绍下，如何在Nest当中使用WebSocket。

## 安装依赖包
```js
npm i --save @nestjs/websockets @nestjs/platform-socket.io
npm i --save-dev @types/socket.io
```

## 创建聊天模块  
```js
nest g module chat
```
下来我们创建一个src/chat/chat.gateway.ts文件来实现@WebSocketGateway
```js
import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';

@WebSocketGateway()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {

    @WebSocketServer() server;
    users: number = 0;

    async handleConnection(){

        // A client has connected
        this.users++;

        // Notify connected clients of current users
        this.server.emit('users', this.users);

    }

    async handleDisconnect(){

        // A client has disconnected
        this.users--;

        // Notify connected clients of current users
        this.server.emit('users', this.users);

    }

    @SubscribeMessage('chat')
    async onChat(client, message){
        client.broadcast.emit('chat', message);
    }

}
```
* 我们首先来看下@WebSocketGateway，这个装饰器的作用实际上是让我们能够使用socket.io里面的功能。  
* OnGatewayConnection, OnGatewayDisconnect这两个是用来追踪客户端连接和断开用的，我们通过handleConnection()和handleDisconnect()这两个钩子函数实现。  
* 我们通过@WebSocketServer这个装饰器来修饰我们的变量server,它是我们的服务实例，我们可以通过它来触发事件并且发送数据给客户端，上面例子我们通过handleConnection()和handleDisconnect()来捕捉到客户端的连接与断开，并且发送消息给所有在线的用户。
* @SubscribeMessage这个装饰器是用来监听客户端发送过来的消息的。如果我们想监听chat事件，我们可以加上事件名，即@SubscribeMessage('chat')。onChat这个方法有两个参数，第一个叫client，实际上就是一个socket实例，第二个message就是客户端发送过来的消息。
* client.broadcast.emit('chat', message)是用来广播消息，通知任何监听chat的客户端

# 修改chat.module.ts
```js
import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';

@Module({
    providers: [ ChatGateway ]
})
export class ChatModule {}
```
这样，最简单的服务端的websocket就已经完成了。

下来我们思考几个问题:
1. 怎么实现多进程的内存共享(socket共享)？
2. 如何将userId和socket绑定呢？  
   
这两个问题其实都可以通过redis来实现。Nest提供了Adapter(适配器功能),下面我们来看看怎么玩:

首先是官方的示例，我们直接拿过来:
```js
// redis.adapter.ts
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as redisIoAdapter from 'socket.io-redis';

const redisAdapter = redisIoAdapter({ host: 'localhost', port: 6379 });

export class RedisIoAdapter extends IoAdapter {
    createIOServer(port: number, options?: any): any {
        const server = super.createIOServer(port, options);
        server.adapter(redisAdapter);
        return server;
    }
}

// main.ts
 const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new RedisIoAdapter(app));
```
很简单的用法，这时候redis已经集成到我们的websocket当中，前面用@WebSocketServer()修饰的变量server里面包含的sockets已经是通过redis共享的了，不必担心跨进程。  
实际上redis这个适配器都依赖于socket.io-redis这个包，大家可以去看下里面的用法，在此就不一一介绍了。

我们来修改下代码,主要通过redis实现userid和socketid进行绑定:
```js
import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@WebSocketGateway()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {

    @WebSocketServer() server;
    users: number = 0;

    async handleConnection(socket) {
        console.log('connection');
        // A client has connected
        this.users++;

        // Notify connected clients of current users
        this.server.emit('users', this.users);

    }

    async handleDisconnect(socket) {
        // A client has disconnected
        this.users--;

        // Notify connected clients of current users
        this.server.emit('users', this.users);
    }

    @SubscribeMessage('userid')
    async bindUserId(socket, message) {
        await this.server.of('/').adapter.pubClient.set(message, socket.id);
        return 'ok';
    }

    async getSocket(userid): Promise<Socket> {
        const socketId = await this.getAsync(userid);
        console.log(socketId);
        return this.server.sockets.sockets[socketId as string];
    }

    getClient(userid) {
        return new Promise((resolve, reject) => {
            this.server.in(userid).clients((err, clients) => {
                resolve(clients);
            });
        });
    }

    getAsync(userid) {
        return new Promise((resolve, reject) => {
            this.server.of('/').adapter.pubClient.get(userid, (err, response) => {
                resolve(response);
            });
        });
    }

    remoteJoin(id, message) {
        return new Promise((resolve, reject) => {
            this.server.of('/').adapter.remoteJoin(id, message)((err) => {
                resolve();
            });
        });
    }
}

```
* this.server.of('/').adapter.pubClient是取"/"该命名空间下的redis连接，bindUserId实际就是往redis插数据，message是客户端传过来的userid，已userid为key,socketid为value  
* getSocket就是从redis取出userid相对应的socketid，然后从server中取出其socket

然后我们在接口中调用getSocket方法，然后发送数据:
```js
@Get()
  async getHello(): Promise<string> {
    // abcd假设为userid
    const socket = await this.socketService.getSocket('abcd');
    // 向该用户发送socket消息，你好
    socket.emit('hello', '你好');
    return this.appService.getHello();
  }
```

下面是client的代码(简单用了express和socket.io-client):
```js
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
```
