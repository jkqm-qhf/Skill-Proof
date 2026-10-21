import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

export default function Modal({
  title,
  children,
  close,
  wide = false,
  closeDisabled = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
  closeDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (prior?.isConnected) prior.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) close();
      }}
    >
      <div className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          disabled={closeDisabled}
          aria-label="关闭弹窗"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
