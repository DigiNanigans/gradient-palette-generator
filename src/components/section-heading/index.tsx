import { classes } from "./style.st.css";

const SectionHeading = (props: {
    title: string
}) => (
    <h2 class={classes.root}>{props.title}</h2>
);

export default SectionHeading;
