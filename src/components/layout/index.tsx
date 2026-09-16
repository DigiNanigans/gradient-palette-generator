import { FnComponent } from "~/types/util";
import { classes } from "./style.st.css";

const Layout: FnComponent = (props) => {
    return (
        <div class={classes.root}>
            {props.children}
        </div>
    );
}

export default Layout;