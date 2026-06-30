import {
  validatePasswordPolicy, hashPassword, comparePassword,
  generateStrongPassword, DEFAULT_POLICY,
} from '../../auth/password';

describe('Password utilities', () => {
  describe('validatePasswordPolicy', () => {
    const policy = DEFAULT_POLICY;

    it('accepts a valid password', () => {
      expect(validatePasswordPolicy('Secure@123', policy)).toBeNull();
    });

    it('rejects password shorter than minLength', () => {
      expect(validatePasswordPolicy('Ab@1', policy)).toMatch(/at least/i);
    });

    it('rejects password missing uppercase', () => {
      expect(validatePasswordPolicy('secure@123', policy)).toMatch(/uppercase/i);
    });

    it('rejects password missing lowercase', () => {
      expect(validatePasswordPolicy('SECURE@123', policy)).toMatch(/lowercase/i);
    });

    it('rejects password missing number', () => {
      expect(validatePasswordPolicy('Secure@abc', policy)).toMatch(/number/i);
    });

    it('rejects password missing special character', () => {
      expect(validatePasswordPolicy('Secure123A', policy)).toMatch(/special/i);
    });

    it('accepts when policy has all requirements disabled', () => {
      const relaxed = { minLength: 1, requireUppercase: false, requireLowercase: false, requireNumber: false, requireSpecial: false };
      expect(validatePasswordPolicy('a', relaxed)).toBeNull();
    });
  });

  describe('hashPassword / comparePassword', () => {
    it('hashes and verifies a correct password', async () => {
      const hash = await hashPassword('MyPassword@1');
      expect(hash).not.toBe('MyPassword@1');
      await expect(comparePassword('MyPassword@1', hash)).resolves.toBe(true);
    });

    it('returns false for wrong password', async () => {
      const hash = await hashPassword('Correct@1');
      await expect(comparePassword('Wrong@999', hash)).resolves.toBe(false);
    });

    it('produces different hashes for the same password (salt)', async () => {
      const h1 = await hashPassword('Same@Pass1');
      const h2 = await hashPassword('Same@Pass1');
      expect(h1).not.toBe(h2);
    });
  });

  describe('generateStrongPassword', () => {
    it('generates a password that passes the default policy', () => {
      for (let i = 0; i < 20; i++) {
        const pwd = generateStrongPassword();
        expect(validatePasswordPolicy(pwd, DEFAULT_POLICY)).toBeNull();
      }
    });

    it('generates unique passwords each call', () => {
      const set = new Set(Array.from({ length: 10 }, () => generateStrongPassword()));
      expect(set.size).toBe(10);
    });

    it('generates a password of at least 12 characters', () => {
      for (let i = 0; i < 5; i++) {
        expect(generateStrongPassword().length).toBeGreaterThanOrEqual(12);
      }
    });
  });
});
