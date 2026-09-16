import { classes } from "./index.st.css";

const features = [
    ["Preact", "A compact component model with fast rendering and familiar JSX."],
    ["Stylable", "Locally scoped styles, typed class names, and reusable design tokens."],
    ["Vite", "A focused development loop with instant module updates and optimized builds."],
] as const;

const Home = () => (
    <main class={classes.root}>
        <section class={classes.hero}>
            <span class={classes.eyebrow}>Project starter</span>
            <h1 class={classes.title}>Build something<br />remarkable.</h1>
            <p class={classes.intro}>
                Your Preact and Stylable foundation is ready. Start in
                <code class={classes.code}>src/routes/index.tsx</code> and make it yours.
            </p>
            <div class={classes.actions}>
                <a class={classes.primaryAction} href="https://preactjs.com/guide/v10/getting-started" target="_blank" rel="noreferrer">
                    Preact guide
                </a>
                <a class={classes.secondaryAction} href="https://stylable.io/docs/getting-started/overview" target="_blank" rel="noreferrer">
                    Stylable docs
                </a>
            </div>
        </section>

        <section class={classes.features} aria-label="Included tools">
            {features.map(([title, description], index) => (
                <article class={classes.card} key={title}>
                    <span class={classes.cardIndex}>0{index + 1}</span>
                    <h2 class={classes.cardTitle}>{title}</h2>
                    <p class={classes.cardCopy}>{description}</p>
                </article>
            ))}
        </section>
    </main>
);

export default Home;
