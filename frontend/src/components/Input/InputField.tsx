import { StandardTextFieldProps, TextField } from "@mui/material";
import React from "react";
import { FieldError, UseFormRegisterReturn } from "react-hook-form";

export interface IInputFieldProps extends StandardTextFieldProps {
  type?: "email" | "password" | "text";
  label?: string;
  errorMessage?: FieldError | undefined;
  registration: Partial<UseFormRegisterReturn>;
  cypressTag?: string;
  variantStyle?: "outlined" | "filled" | "standard";
  value?: string;
}

export function InputField(props: IInputFieldProps) {
  const {
    cypressTag,
    errorMessage,
    registration,
    label,
    type,
    variantStyle = "outlined",
    value,
    ...defaultProps
  } = props;
  return (
    <TextField
      data-cy={cypressTag}
      {...defaultProps}
      error={Boolean(errorMessage)}
      helperText={errorMessage && errorMessage.message}
      {...registration}
      label={label}
      type={type}
      variant={variantStyle}
      value={value}
    />
  );
}
