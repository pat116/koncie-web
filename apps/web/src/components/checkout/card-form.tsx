'use client';

import { useState } from 'react';

export interface CardFormValues {
  pan: string;
  expiryMonth: number;
  expiryYear: number;
  cvc: string;
  cardholderName: string;
}

interface CardFormProps {
  name: string; // hidden input JSON payload name
}

/**
 * TODO(sprint-3): replace with Kovena's hosted card iframe so the PAN never
 * touches our server. Sprint 2 mock accepts plaintext PAN for fail-trigger testing.
 */
export function CardForm({ name }: CardFormProps) {
  const [values, setValues] = useState<CardFormValues>({
    pan: '',
    expiryMonth: 12,
    expiryYear: new Date().getFullYear() + 1,
    cvc: '',
    cardholderName: '',
  });

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs font-semibold text-koncie-charcoal">
        Card number
        <input
          type="text"
          inputMode="numeric"
          autoComplete="cc-number"
          value={values.pan}
          onChange={(e) => setValues({ ...values, pan: e.target.value.replace(/\s/g, '') })}
          placeholder="4242 4242 4242 4242"
          className="rounded-lg border border-koncie-border bg-white px-3 py-2 font-mono text-sm"
          required
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-koncie-charcoal">
          Expiry
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={12}
              value={values.expiryMonth}
              onChange={(e) => setValues({ ...values, expiryMonth: Number(e.target.value) })}
              className="w-16 rounded-lg border border-koncie-border bg-white px-2 py-2 text-sm"
              required
            />
            <span className="self-center">/</span>
            <input
              type="number"
              min={2000}
              max={2100}
              value={values.expiryYear}
              onChange={(e) => setValues({ ...values, expiryYear: Number(e.target.value) })}
              className="w-24 rounded-lg border border-koncie-border bg-white px-2 py-2 text-sm"
              required
            />
          </div>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-koncie-charcoal">
          CVC
          <input
            type="text"
            inputMode="numeric"
            autoComplete="cc-csc"
            value={values.cvc}
            onChange={(e) => setValues({ ...values, cvc: e.target.value })}
            placeholder="123"
            className="rounded-lg border border-koncie-border bg-white px-3 py-2 text-sm"
            required
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs font-semibold text-koncie-charcoal">
        Name on card
        <input
          type="text"
          autoComplete="cc-name"
          value={values.cardholderName}
          onChange={(e) => setValues({ ...values, cardholderName: e.target.value })}
          className="rounded-lg border border-koncie-border bg-white px-3 py-2 text-sm"
          required
        />
      </label>

      <input type="hidden" name={name} value={JSON.stringify(values)} />
    </div>
  );
}
