import type { ComponentChildren } from "preact";
import { classes } from "./style.st.css";

const PageHeader = (props: {
    title: string,
    children?: ComponentChildren,
}) => (
    <header class={classes.root}>
        <h1 class={classes.title}>{props.title}</h1>
        {props.children}
    </header>
);

export default PageHeader;
