"use client";

import { useState, type InputHTMLAttributes } from "react";

export function AuthField({
  label,
  onChange,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [dateFilled, setDateFilled] = useState(
    Boolean(input.value ?? input.defaultValue),
  );
  return (
    <label className="auth-field">
      <input
        {...input}
        placeholder=" "
        data-filled={input.type === "date" ? dateFilled : undefined}
        onChange={(event) => {
          if (input.type === "date") setDateFilled(Boolean(event.target.value));
          onChange?.(event);
        }}
      />
      <span className="auth-field-label">{label}</span>
    </label>
  );
}
