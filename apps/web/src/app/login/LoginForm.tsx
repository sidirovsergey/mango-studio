'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { sendOtpAction } from './actions/sendOtpAction';
import { verifyOtpAction } from './actions/verifyOtpAction';

const OTP_MIN_LENGTH = 4;
const OTP_MAX_LENGTH = 10;

export function LoginForm() {
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  // Move focus to the active stage's input. autoFocus on the JSX element is
  // disallowed by lint/a11y/noAutofocus (jumps screen-reader users out of
  // page context); ref-based focus on mount/stage-change is the supported
  // pattern. Without this, the user sees the form but has to click the
  // input — friction during a hot moment in the flow.
  useEffect(() => {
    if (stage === 'email') {
      emailInputRef.current?.focus();
    } else {
      codeInputRef.current?.focus();
    }
  }, [stage]);

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

  const onResend = () => {
    setError(null);
    setCode('');
    startTransition(async () => {
      const r = await sendOtpAction({ email });
      if (!r.ok) {
        setError(r.error.message);
      }
    });
  };

  if (stage === 'email') {
    return (
      <form onSubmit={onSendCode} className="login-form">
        <label className="login-field">
          <span className="login-field-label">Email</span>
          <input
            ref={emailInputRef}
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <button type="submit" disabled={isPending || !email}>
          {isPending ? 'Отправляем…' : 'Получить код'}
        </button>
        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={onVerifyCode} className="login-form">
      <div className="login-sent-to">
        Код отправлен на <strong>{email}</strong>
      </div>
      <label className="login-field">
        <span className="login-field-label">Код из письма</span>
        <input
          ref={codeInputRef}
          className="login-otp-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          minLength={OTP_MIN_LENGTH}
          maxLength={OTP_MAX_LENGTH}
          required
          placeholder="••••••"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_MAX_LENGTH))}
        />
      </label>
      <button type="submit" disabled={isPending || code.length < OTP_MIN_LENGTH}>
        {isPending ? 'Проверяем…' : 'Подтвердить'}
      </button>
      <div className="login-secondary-row">
        <button
          type="button"
          className="login-link"
          onClick={() => {
            setStage('email');
            setCode('');
            setError(null);
          }}
        >
          ← Изменить email
        </button>
        <button type="button" className="login-link" onClick={onResend} disabled={isPending}>
          Отправить код ещё раз
        </button>
      </div>
      {error && (
        <div className="login-error" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
