import { loginSchema, registerSchema, type LoginInput } from '@carintel/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, Navigate } from 'react-router-dom';
import { CarStage } from '../components/car/CarStage';
import { Field } from '../components/Field';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, signIn } = useAuth();
  const isLogin = mode === 'login';

  const form = useForm<LoginInput>({
    resolver: zodResolver(isLogin ? loginSchema : registerSchema),
  });

  const mutation = useMutation({
    mutationFn: (input: LoginInput) => (isLogin ? api.login(input) : api.register(input)),
    onSuccess: signIn,
  });

  if (user) return <Navigate to="/" replace />;

  const { errors } = form.formState;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="w-full max-w-lg animate-fade-up">
        <CarStage hotspotDelayMs={0} />
      </div>
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="glass animate-fade-up flex w-full max-w-sm flex-col gap-4 p-6"
        style={{ animationDelay: '300ms' }}
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CarIntel</h1>
          <p className="text-sm text-mist">
            {isLogin ? 'AI-перевірка авто перед покупкою' : 'Створіть акаунт'}
          </p>
        </div>

        <Field label="Email" type="email" autoComplete="email" error={errors.email?.message} {...form.register('email')} />
        <Field
          label="Пароль"
          type="password"
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          error={errors.password?.message}
          {...form.register('password')}
        />

        {mutation.error && <p className="text-sm text-sev-critical">{mutation.error.message}</p>}

        <button type="submit" disabled={mutation.isPending} className="btn btn-primary mt-1">
          {isLogin ? 'Увійти' : 'Зареєструватися'}
        </button>

        <p className="text-center text-sm text-mist">
          {isLogin ? (
            <>
              Немає акаунта? <Link to="/register" className="text-ice underline underline-offset-4">Реєстрація</Link>
            </>
          ) : (
            <>
              Вже є акаунт? <Link to="/login" className="text-ice underline underline-offset-4">Увійти</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
