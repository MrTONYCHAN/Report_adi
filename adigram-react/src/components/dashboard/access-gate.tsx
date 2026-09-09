import { useEffect, useState, type ReactNode } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Lock, LoaderCircle } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ACCESS_CODE_LENGTH, useSessionQuery, useSignIn } from "@/lib/access";

const SLOTS = Array.from({ length: ACCESS_CODE_LENGTH }, (_, index) => index);

function AccessScreen() {
  const [code, setCode] = useState("");
  const signIn = useSignIn();
  const complete = code.length === ACCESS_CODE_LENGTH;

  /* Submitting on the last digit is what makes a box-per-digit field worth
     having: there is nothing left to decide once the code is complete. The
     effect keys off the code so a corrected digit re-submits on its own. */
  useEffect(() => {
    if (complete && !signIn.isPending) signIn.mutate(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          if (complete && !signIn.isPending) signIn.mutate(code);
        }}
      >
        <div className="flex flex-col items-center text-center">
          <div className="rounded-full bg-muted p-3 text-muted-foreground">
            <Lock className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-card-foreground">
            ADIGRAMS 2.0 Readiness
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the {ACCESS_CODE_LENGTH}-digit access code to open the dashboard.
          </p>
        </div>

        <div className="mt-6 flex justify-center">
          <InputOTP
            maxLength={ACCESS_CODE_LENGTH}
            pattern={REGEXP_ONLY_DIGITS}
            value={code}
            onChange={setCode}
            disabled={signIn.isPending}
            autoFocus
            aria-label="Access code"
            aria-invalid={Boolean(signIn.error)}
            containerClassName="gap-0"
          >
            <InputOTPGroup>
              {SLOTS.map((index) => (
                <InputOTPSlot key={index} index={index} className="h-11 w-9 font-mono text-base" />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        <div className="mt-4 min-h-10 text-center text-sm" aria-live="polite">
          {signIn.isPending ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground" role="status">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              Checking the code…
            </span>
          ) : signIn.error ? (
            <span className="text-destructive" role="alert">
              {signIn.error.message}
            </span>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={!complete || signIn.isPending}
          className="mt-2 w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          Unlock dashboard
        </button>
      </form>
    </main>
  );
}

/** Renders the dashboard only once the server has accepted an access code. */
export function AccessGate({ children }: { children: ReactNode }) {
  const { data, isPending, error, refetch, isFetching } = useSessionQuery();

  if (isPending)
    return (
      <main className="flex min-h-screen items-center justify-center bg-background" aria-busy>
        <p className="text-sm text-muted-foreground" role="status">
          Checking your session…
        </p>
      </main>
    );

  if (error)
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-8">
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="rounded-xl bg-primary px-4 py-3 text-primary-foreground"
        >
          {isFetching ? "Retrying…" : "Try again"}
        </button>
      </main>
    );

  return data?.signedIn ? <>{children}</> : <AccessScreen />;
}
