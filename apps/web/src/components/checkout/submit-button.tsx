'use client';

import { Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';

export interface SubmitButtonProps {
  label: string;
  pendingLabel?: string;
}

export function SubmitButton({ label, pendingLabel = 'Processing payment…' }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={
        'mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-koncie-navy px-5 py-4 text-sm font-semibold text-white transition-opacity hover:opacity-90' +
        (pending ? ' cursor-not-allowed opacity-70' : '')
      }
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>{pendingLabel}</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}
