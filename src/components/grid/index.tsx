import { ComponentChildren } from "preact";
import { classes } from "./style.st.css";

const Grid = (props: {
    children?: ComponentChildren,
}) => (
    <div class={classes.root}>
        {props.children}
    </div>
);

const Col = (props: {
    children?: ComponentChildren,
}) => (
    <div class={classes.col}>
        {props.children}
    </div>
);

export default Object.assign(Grid, {
    Col
});
