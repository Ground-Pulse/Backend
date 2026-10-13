import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../auth/jwt.strategy';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '') ||
        (client.handshake.query?.token as string);

      if (!token) {
        this.logger.warn(`Client connection rejected: Missing token [${client.id}]`);
        client.disconnect();
        return;
      }

      const secret = this.configService.get<string>('JWT_SECRET') || 'super-secret-jwt-key';
      const payload = this.jwtService.verify<JwtPayload>(token, { secret });

      const userId = payload.sub;
      client.data.userId = userId;
      client.data.role = payload.role;

      // Auto-join room for user
      await client.join(`user:${userId}`);
      this.logger.log(`Client connected: ${client.id} (User: ${userId}) joined room user:${userId}`);
    } catch (err: any) {
      this.logger.warn(`Client authentication failed: ${err.message} [${client.id}]`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id} (User: ${client.data?.userId})`);
  }

  emitToUser(userId: string, event: string, data: any) {
    if (this.server) {
      this.server.to(`user:${userId}`).emit(event, data);
    }
  }

  broadcast(event: string, data: any) {
    if (this.server) {
      this.server.emit(event, data);
    }
  }

  emitRepairStatusUpdated(repairId: string, status: string, notifyUserIds?: string[]) {
    const payload = { repairId, status };
    if (notifyUserIds && notifyUserIds.length > 0) {
      for (const uid of notifyUserIds) {
        this.emitToUser(uid, 'repair.status.updated', payload);
      }
    } else {
      this.broadcast('repair.status.updated', payload);
    }
  }

  emitIssueFlagged(issueId: string, propertyId: string, notifyUserId?: string) {
    const payload = { issueId, propertyId };
    if (notifyUserId) {
      this.emitToUser(notifyUserId, 'issue.flagged', payload);
    } else {
      this.broadcast('issue.flagged', payload);
    }
  }

  emitReportReady(inspectionId: string, reportUrl: string, notifyUserId?: string) {
    const payload = { inspectionId, reportUrl };
    if (notifyUserId) {
      this.emitToUser(notifyUserId, 'report.ready', payload);
    } else {
      this.broadcast('report.ready', payload);
    }
  }

  emitNewNotification(userId: string, notification: { id: string; type: string; payload: any }) {
    this.emitToUser(userId, 'notification.new', notification);
  }
}
