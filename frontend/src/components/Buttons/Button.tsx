import { cn } from "../../libs/utils";
import { Button as ButtonMUI, ButtonProps } from "@mui/material";

export interface IButtonProps extends ButtonProps {
  children: React.ReactNode;
  colorVariant?:
    | "deepSkyBlue"
    | "secondary"
    | "richTurquoise"
    | "softSand"
    | "earthyGreen";
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
    variant = "contained",
    colorVariant = "primary", // Default to primary
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
        variant === "outlined" &&
          `border-${colorVariant} text-${colorVariant} hover:bg-${colorVariant} hover:text-white`,
        className
      )}
      sx={{
        backgroundColor:
          variant === "contained" ? `${colorVariant}` : undefined,
        color: variant === "contained" ? `${colorVariant}` : undefined,
        "&:hover": {
          backgroundColor:
            variant === "contained"
              ? `${colorVariant}-hover, var(--tw-color-${colorVariant}))`
              : undefined,
        },
      }}
      variant={variant}
    >
      {children}
    </ButtonMUI>
  );
}
