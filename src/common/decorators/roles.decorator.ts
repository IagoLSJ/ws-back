import { SetMetadata } from '@nestjs/common';
import { RoleNegocio } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleNegocio[]) => SetMetadata(ROLES_KEY, roles);
