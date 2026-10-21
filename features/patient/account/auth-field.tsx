"use client";

import { useId, useState, type InputHTMLAttributes } from "react";

export function AuthField({
  label,
  onChange,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [dateFilled, setDateFilled] = useState(
    Boolean(input.value ?? input.defaultValue),
  );
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const id = input.id ?? generatedId;
  const password = input.type === "password";
  const field = (
    <label className="auth-field">
      <input
        {...input}
        id={id}
        type={password && visible ? "text" : input.type}
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
  return password ? (
    <div className="auth-password">
      {field}
      <button
        type="button"
        aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
        aria-controls={id}
        aria-pressed={visible}
        disabled={input.disabled}
        onClick={() => setVisible(!visible)}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  ) : (
    field
  );
}
