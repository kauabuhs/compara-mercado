"use client";

import { useRef, useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogProps } from "@/components/ui/dialog";

type Confirmation = Pick<
  ConfirmDialogProps,
  "variant" | "title" | "description" | "confirmLabel" | "cancelLabel" | "destructive"
>;

/**
 * Botão de envio de formulário que pede confirmação antes (estilo alerta ou action sheet).
 * Serve para Server Actions: ao confirmar, o <form> que o contém é enviado normalmente.
 */
export function ConfirmSubmitButton({
  confirmation,
  children,
  ...buttonProps
}: Omit<ButtonProps, "type" | "onClick" | "ref"> & { confirmation: Confirmation }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button {...buttonProps} ref={buttonRef} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {children}
      </Button>
      <ConfirmDialog
        {...confirmation}
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => buttonRef.current?.form?.requestSubmit()}
      />
    </>
  );
}
