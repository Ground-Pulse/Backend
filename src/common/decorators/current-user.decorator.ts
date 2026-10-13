import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@prisma/client';

export type UserWithoutPassword = Omit<User, 'passwordHash'>;

export const CurrentUser = createParamDecorator(
  (data: keyof UserWithoutPassword | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as UserWithoutPassword;
    return data && user ? user[data] : user;
  },
);
