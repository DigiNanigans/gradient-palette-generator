import { classes } from "./not-found.st.css";

const NotFound = () => (
    <main class={classes.root}>
        <p class={classes.status}>404</p>
        <h1 class={classes.title}>This page wandered off.</h1>
        <a class={classes.link} href="/">Return home</a>
    </main>
);

export default NotFound;
