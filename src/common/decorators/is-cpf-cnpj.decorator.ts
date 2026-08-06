import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { validarCpfCnpj } from '../utils/documento';

@ValidatorConstraint({ name: 'IsCpfOuCnpj', async: false })
export class IsCpfOuCnpjConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    if (!value.trim()) return true;
    return validarCpfCnpj(value);
  }

  defaultMessage(): string {
    return 'CPF/CNPJ inválido';
  }
}

export function IsCpfOuCnpj(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCpfOuCnpjConstraint,
    });
  };
}
