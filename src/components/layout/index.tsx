import { FnComponent } from "~/types/util";
import { classes } from "./style.st.css";
import { ToastProvider } from "~/hooks/use-toast";

const Layout: FnComponent = (props) => {
    return (
        <ToastProvider>
            <main class={classes.root}>
                {props.children}
            </main>
        </ToastProvider>
    );
}

export default Layout;
