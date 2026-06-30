import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
}

export const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
};

export function validatePasswordPolicy(password: string, policy = DEFAULT_POLICY): string | null {
  if (password.length < policy.minLength)
    return `Password must be at least ${policy.minLength} characters`;
  if (policy.requireUppercase && !/[A-Z]/.test(password))
    return 'Password must contain at least one uppercase letter';
  if (policy.requireLowercase && !/[a-z]/.test(password))
    return 'Password must contain at least one lowercase letter';
  if (policy.requireNumber && !/[0-9]/.test(password))
    return 'Password must contain at least one number';
  if (policy.requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password))
    return 'Password must contain at least one special character';
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateStrongPassword(): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;

  const rand = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars = [rand(upper), rand(lower), rand(digits), rand(special)];
  for (let i = 0; i < 8; i++) chars.push(rand(all));
  return chars.sort(() => Math.random() - 0.5).join('');
}

export function getPasswordStrength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score++;

  const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong', 'Excellent'];
  return { score, label: labels[Math.min(score, labels.length - 1)] };
}
