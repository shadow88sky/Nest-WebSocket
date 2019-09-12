import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ChatGateway } from './chat/chat.gateway';
import { Socket } from 'socket.io';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService,
              private readonly socketService: ChatGateway,
  ) { }

  @Get()
  async getHello(): Promise<string> {
    const socket = await this.socketService.getSocket('abcd');
    socket.emit('hello', '你好');
    return this.appService.getHello();
  }
}
