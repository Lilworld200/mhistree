"use client";
import { useId, useState, type InputHTMLAttributes } from "react";
import { AuthField } from "@/features/patient/account/auth-field";
export function ProfessionalField({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const password = props.type === "password";
  return (
    <div className="pro-field">
      <div className={password ? "pro-password" : undefined}>
        <AuthField
          {...props}
          label={label}
          id={id}
          aria-describedby={hint ? `${id}-hint` : props["aria-describedby"]}
          type={password && visible ? "text" : props.type}
        />
        {password && (
          <button
            type="button"
            aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            {visible ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
