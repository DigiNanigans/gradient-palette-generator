import type { ReadonlySignal } from "@preact/signals";
import type { ToastState } from "~/hooks/use-toast";
import { classes, st } from "./style.st.css";

const ToastNotification = (props: { notification: ReadonlySignal<ToastState | undefined>; onDismiss: () => void }) => {
    const notification = props.notification.value;
    const { onDismiss } = props;

    if (!notification) return null;

    return (
        <div class={st(classes.root, {tone: notification.tone})}
            role={notification.tone === "error" ? "alert" : "status"}
            aria-live={notification.tone === "error" ? "assertive" : "polite"}
        >
            <span>{notification.message}</span>
            <button class={classes.dismiss} type="button" onClick={onDismiss} aria-label="Dismiss notification">×</button>
        </div>
    );
};

export default ToastNotification;
