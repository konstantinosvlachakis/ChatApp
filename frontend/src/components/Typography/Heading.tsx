import React from "react";
import { cn } from "../../libs/utils";

 
export interface IHeadingProps {
  className?: string;
  children?: React.ReactNode;
}
 
function Heading({ children, className }: IHeadingProps) {
  return <h1 className={cn('font-alegreyaSans-black text-primary text-4xl', className)}>{children}</h1>;
}
 
export default Heading;
 