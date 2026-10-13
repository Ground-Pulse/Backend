import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CaslAbilityFactory, AppAbility } from '../casl-ability.factory';
import { CHECK_POLICIES_KEY, PolicyHandler } from '../../../common/decorators/check-policies.decorator';
import { GroundPulseException } from '../../../common/exceptions/ground-pulse.exception';

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private caslAbilityFactory: CaslAbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policyHandlers =
      this.reflector.getAllAndOverride<PolicyHandler[]>(
        CHECK_POLICIES_KEY,
        [context.getHandler(), context.getClass()],
      ) || [];

    if (policyHandlers.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw GroundPulseException.unauthorized();
    }

    const ability = this.caslAbilityFactory.createForUser(user);

    const hasPermission = policyHandlers.every((handler) =>
      this.execPolicyHandler(handler, ability),
    );

    if (!hasPermission) {
      throw GroundPulseException.forbiddenNotOwner('Action forbidden by authorization policies');
    }

    return true;
  }

  private execPolicyHandler(handler: PolicyHandler, ability: AppAbility): boolean {
    if (typeof handler === 'function') {
      return handler(ability);
    }
    return handler.handle(ability);
  }
}
