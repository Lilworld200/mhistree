"use client";
import { useId, type InputHTMLAttributes } from "react";
import { AuthField } from "@/features/patient/account/auth-field";
export function ProfessionalField({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <div className="pro-field">
      <AuthField
        {...props}
        label={label}
        id={id}
        aria-describedby={hint ? `${id}-hint` : props["aria-describedby"]}
      />
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
