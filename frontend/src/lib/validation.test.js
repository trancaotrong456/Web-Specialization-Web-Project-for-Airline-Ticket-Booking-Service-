import { describe, expect, it } from 'vitest';
import { mapApiFieldErrors, validateRoleName } from './validation';

describe('mapApiFieldErrors', () => {
  it.each([null, undefined, { message: 'Business rule failed' }])('returns an empty map when API errors are not a list (%s)', (errors) => {
    expect(mapApiFieldErrors(errors)).toEqual({});
  });

  it('maps API validation errors by field path', () => {
    expect(mapApiFieldErrors([{ path: 'name', msg: 'Invalid role name' }])).toEqual({ name: 'Invalid role name' });
  });
});

describe('validateRoleName', () => {
  it('matches the role-name format accepted by the API', () => {
    expect(validateRoleName('support_lead')).toBeNull();
    expect(validateRoleName('support lead')).toBe('Tên vai trò chỉ gồm chữ thường, số, dấu gạch ngang hoặc gạch dưới; bắt đầu bằng chữ thường và dài 2–50 ký tự.');
  });
});
