import { useEffect, useState, type ReactNode } from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  BrandEllipsis,
  BrandLogo,
  BrandScreen,
  BrandWordmark,
  DotMatrix,
} from "@/components/dashboard/brand-screen";
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
    <BrandScreen>
      <form
        className="brand-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (complete && !signIn.isPending) signIn.mutate(code);
        }}
      >
        <div className="flex flex-col items-center text-center">
          <BrandLogo />
          <BrandWordmark className="mt-5 text-xl sm:text-2xl" />
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the {ACCESS_CODE_LENGTH}-digit access code to open the dashboard.
          </p>
        </div>

        <div className="mt-7 flex justify-center">
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
                <InputOTPSlot
                  key={index}
                  index={index}
                  className="otp-slot h-12 w-9 font-mono text-base sm:h-13 sm:w-10 sm:text-lg"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        <div className="mt-4 min-h-10 text-center text-sm" aria-live="polite">
          {signIn.isPending ? (
            <span className="inline-flex items-center gap-2.5 text-muted-foreground" role="status">
              <DotMatrix small />
              Checking the code
              <BrandEllipsis />
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
          className="press mt-2 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          Unlock dashboard
        </button>
      </form>
    </BrandScreen>
  );
}

/** Renders the dashboard only once the server has accepted an access code. */
export function AccessGate({ children }: { children: ReactNode }) {
  const { data, isPending, error, refetch, isFetching } = useSessionQuery();

  if (isPending)
    return (
      <BrandScreen busy>
        <div className="brand-card flex flex-col items-center gap-6 text-center">
          <BrandLogo />
          <div>
            <BrandWordmark className="text-xl sm:text-2xl" />
            <p className="mt-2 text-sm text-muted-foreground" role="status">
              Checking your session
              <BrandEllipsis />
            </p>
          </div>
          <DotMatrix />
        </div>
      </BrandScreen>
    );

  if (error)
    return (
      <BrandScreen>
        <div className="brand-card flex flex-col items-center gap-5 text-center">
          <BrandLogo />
          <div>
            <BrandWordmark className="text-xl sm:text-2xl" />
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error.message}
            </p>
          </div>
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="press w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {isFetching ? "Retrying…" : "Try again"}
          </button>
        </div>
      </BrandScreen>
    );

  return data?.signedIn ? <>{children}</> : <AccessScreen />;
}
