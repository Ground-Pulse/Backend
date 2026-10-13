import { Injectable } from '@nestjs/common';
import {
  AbilityBuilder,
  PureAbility,
  AbilityClass,
} from '@casl/ability';
import {
  User,
  Role,
} from '@prisma/client';

export enum Action {
  Manage = 'manage',
  Create = 'create',
  Read = 'read',
  Update = 'update',
  Delete = 'delete',
}

export type Subjects =
  | 'User'
  | 'Property'
  | 'Inspection'
  | 'Issue'
  | 'Repair'
  | 'Notification'
  | 'all';

export type AppAbility = PureAbility<[Action, Subjects]>;
export const AppAbility = PureAbility as AbilityClass<AppAbility>;

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: Omit<User, 'passwordHash'>): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(
      AppAbility as AbilityClass<AppAbility>,
    );

    if (user.role === Role.ADMIN) {
      can(Action.Manage, 'all'); // Admin has full access
    } else if (user.role === Role.OWNER) {
      // Owner abilities
      can(Action.Create, 'Property');
      can(Action.Read, 'Property');
      can(Action.Update, 'Property');

      can(Action.Read, 'Inspection');
      can(Action.Create, 'Inspection'); // Owner can schedule inspections

      can(Action.Read, 'Issue');
      can(Action.Update, 'Issue'); // Owner approves/declines issues

      can(Action.Read, 'Repair');
    } else if (user.role === Role.INSPECTOR) {
      // Inspector abilities
      can(Action.Read, 'Property');

      can(Action.Read, 'Inspection');
      can(Action.Update, 'Inspection'); // Fill checklist, submit

      can(Action.Create, 'Issue');
      can(Action.Read, 'Issue');

      can(Action.Read, 'Repair');
    } else if (user.role === Role.PROVIDER) {
      // Provider abilities
      can(Action.Read, 'Property');
      can(Action.Read, 'Issue');
      can(Action.Read, 'Repair');
      can(Action.Update, 'Repair'); // Update repair status, mark complete
    }

    return build({
      detectSubjectType: (item) => item as any,
    });
  }
}
