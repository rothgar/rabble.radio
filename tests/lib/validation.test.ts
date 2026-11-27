import { describe, expect, it } from 'vitest';
import { check, ValidationError, validationErrorResponse } from '@/lib/validation';

describe('check', () => {
  it('does nothing when the condition is truthy', () => {
    expect(() => check(true, 'unused')).not.toThrow();
    expect(() => check('non-empty', 'unused')).not.toThrow();
  });

  it('throws a ValidationError with the given message when falsy', () => {
    expect(() => check(false, 'Title is required.')).toThrow(ValidationError);
    expect(() => check(false, 'Title is required.')).toThrow('Title is required.');
    expect(() => check(0, 'zero is falsy')).toThrow(ValidationError);
    expect(() => check('', 'empty string is falsy')).toThrow(ValidationError);
  });
});

describe('validationErrorResponse', () => {
  it('renders a 400 with the validation_error shape', async () => {
    const res = validationErrorResponse(new ValidationError('Title is required.'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'validation_error',
      message: 'Title is required.',
    });
  });
});
