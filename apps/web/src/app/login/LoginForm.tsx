'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendOtpAction } from './actions/sendOtpAction';
import { verifyOtpAction } from './actions/verifyOtpAction';

export function LoginForm() {
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const onSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await sendOtpAction({ email });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setStage('code');
    });
  };

  const onVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await verifyOtpAction({ email, token: code });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      router.push('/');
      router.refresh();
    });
  };

  if (stage === 'email') {
    return (
      <form onSubmit={onSendCode} className="login-form">
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <button type="submit" disabled={isPending || !email}>Получить код</button>
        {error && <div className="login-error" role="alert">{error}</div>}
      </form>
    );
  }

  return (
    <form onSubmit={onVerifyCode} className="login-form">
      <input
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        required
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        autoComplete="one-time-code"
      />
      <button type="submit" disabled={isPending || code.length !== 6}>Подтвердить</button>
      <button type="button" className="login-back" onClick={() => setStage('email')}>← Изменить email</button>
      {error && <div className="login-error" role="alert">{error}</div>}
    </form>
  );
}
