import { type ReadonlySignal, useSignal } from "@preact/signals";
import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useRef } from "preact/hooks";
import ToastNotification from "~/components/toast-notification";

export type ToastTone = "neutral" | "success" | "warning" | "error";

export type ToastOptions = {
    duration?: number;
    tone?: ToastTone;
};

export type ToastState = {
    message: string;
    tone: ToastTone;
};

type ToastContextValue = {
    notification: ReadonlySignal<ToastState | undefined>;
    notify: (message: string, options?: ToastOptions) => void;
    dismiss: () => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider = (props: { children?: ComponentChildren }) => {
    
    const timer = useRef<number>();
    const notification = useSignal<ToastState>();

    const dismiss = () => {
        window.clearTimeout(timer.current);
        notification.value = undefined;
    };

    const notify = (message: string, options: ToastOptions = {}) => {
        const { duration = 2400, tone = "neutral" } = options;

        window.clearTimeout(timer.current);
        notification.value = { message, tone };

        if (duration > 0) {
            timer.current = window.setTimeout(() => {
                notification.value = undefined;
            }, duration);
        }
    };

    useEffect(() => () => window.clearTimeout(timer.current), []);

    const value = { notification, notify, dismiss };

    return (
        <ToastContext.Provider value={value}>
            <>
                {props.children}
                <ToastNotification notification={notification} onDismiss={dismiss} />
            </>
        </ToastContext.Provider>
    );
    
};

export const useToast = () => {
    const context = useContext(ToastContext);

    if (!context) throw new Error("useToast must be used within ToastProvider");
    return context;
};
