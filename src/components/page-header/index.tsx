import { classes } from "./style.st.css";

const PageHeader = (props: {
    title: string,
}) => (
    <header class={classes.root}>
        <h1 class={classes.title}>{props.title}</h1>
    </header>
);

export default PageHeader;
