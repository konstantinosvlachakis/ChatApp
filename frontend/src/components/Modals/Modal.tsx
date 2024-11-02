import Modal from "@mui/material/Modal";
import CloseIcon from "@mui/icons-material/Close";
import { IconButton } from "@mui/material";
import React from "react";
import { cn } from "../../libs/utils";
import Heading from "../Typography/Heading";

export interface IModalComponentProps {
  title?: string | React.ReactNode;
  children?: React.ReactNode;
  open: boolean;
  setOpen: (state: boolean) => void;
  className?: string;
  cypressTag?: string;
  hideClose?: boolean;
}

export default function ModalComponent({
  title,
  children,
  open = false,
  setOpen,
  className,
  cypressTag,
  hideClose = false,
}: IModalComponentProps) {
  const handleClose = () => setOpen(false);

  return (
    <div>
      <Modal
        open={open}
        data-cy={cypressTag}
        onClose={handleClose}
        aria-labelledby="modal-modal-title"
        aria-describedby="modal-modal-description"
        className="flex justify-center items-center"
      >
        <div className="relative text-primary">
          {!hideClose && (
            <IconButton
              onClick={() => setOpen(false)}
              className="absolute top-5 right-5 text-pr z-20"
            >
              <CloseIcon className="text-4xl" />
            </IconButton>
          )}
          <div
            className={cn(
              "over bg-white w-fit min-w-[450px] min-h-5 p-5 max-w-[1200px] m-5 shadow-md overflow-auto tall:max-w-[auto] tall:max-h-[500px]",
              className
            )}
          >
            {title && <Heading className="m-0">{title}</Heading>}
            {children}
          </div>
        </div>
      </Modal>
    </div>
  );
}
