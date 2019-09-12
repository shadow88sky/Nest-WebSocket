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
