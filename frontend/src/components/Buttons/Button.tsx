import { cn } from "../../libs/utils";
import { Button as ButtonMUI, ButtonProps } from "@mui/material";

export interface IButtonProps extends ButtonProps {
  children: React.ReactNode;
  colorVariant?: "primary" | "secondary" | "outline";
  variant?: "contained" | "outlined" | "text";
  fullWidth?: boolean;
  className?: string;
  size?: "large" | "medium" | "small";
  type?: "button" | "submit" | "reset";
  cypressTag?: string;
}

export default function Button(_props: IButtonProps) {
  const {
    children,
    variant,
    className,
    onClick,
    fullWidth,
    type,
    cypressTag,
    ...props
  } = _props;

  return (
    <ButtonMUI
      {...props}
      data-cy={cypressTag}
      type={type}
      onClick={onClick}
      fullWidth={fullWidth}
      className={cn(
        "lg:min-w-[230px] p-3 font-alegreyaSans-black text-lg",
        props.color === "secondary" &&
          variant === "contained" &&
          "text-white border-primary/50 border-solid border",
        variant === "outlined" &&
          "hover:bg-secondary hover:text-white border-primary",
        className
      )}
      variant={variant}
    >
      {children}
    </ButtonMUI>
  );
}
